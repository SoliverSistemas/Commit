import os
import json
import math
import time
from datetime import datetime
from functools import wraps
from threading import Lock
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from supabase_client import supabase

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "change-me-in-production")

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
GEOCODE_CACHE_TTL_SECONDS = int(os.getenv("GEOCODE_CACHE_TTL_SECONDS", "86400"))
GEOCODE_CACHE = {}
GEOCODE_CACHE_LOCK = Lock()
GEOCODE_RATE_LIMIT_PER_MIN = int(os.getenv("GEOCODE_RATE_LIMIT_PER_MIN", "25"))
GEOCODE_RATE_LIMIT = {}
GEOCODE_RATE_LIMIT_LOCK = Lock()


def is_open_now(pizzaria):
    def parse_time(value, fallback):
        if not value:
            value = fallback
        if hasattr(value, "strftime"):
            return value
        raw = str(value).strip()
        for fmt in ("%H:%M", "%H:%M:%S"):
            try:
                return datetime.strptime(raw, fmt).time()
            except ValueError:
                continue
        return datetime.strptime(fallback, "%H:%M").time()

    if pizzaria.get("status_override") == "aberto":
        return True
    if pizzaria.get("status_override") == "fechado":
        return False
    agora = datetime.now().time()
    abertura = parse_time(pizzaria.get("horario_abertura"), "18:00")
    fechamento = parse_time(pizzaria.get("horario_fechamento"), "23:00")
    if fechamento < abertura:
        return agora >= abertura or agora <= fechamento
    return abertura <= agora <= fechamento


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_logado"):
            return redirect(url_for("admin_login"))
        return view(*args, **kwargs)

    return wrapped


def ok(payload=None, status=200):
    response = {"status": "ok"}
    if payload:
        response.update(payload)
    return jsonify(response), status


def fail(message, status=400):
    return jsonify({"status": "erro", "erro": message}), status


def parse_json():
    data = request.get_json(silent=True) or {}
    return data


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_json(url, headers=None, timeout=8):
    request = Request(url, headers=headers or {"User-Agent": "commit-saas/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def reverse_geocode_postcode(address_query):
    lat, lon = geocode_address(address_query)
    if lat is None or lon is None:
        return None
    url = (
        "https://nominatim.openstreetmap.org/reverse"
        f"?format=jsonv2&lat={lat}&lon={lon}&zoom=18&addressdetails=1"
    )
    try:
        data = fetch_json(url, headers={"User-Agent": "commit-saas/1.0"}, timeout=10)
    except Exception:
        return None
    address = data.get("address", {}) if isinstance(data, dict) else {}
    postcode = str(address.get("postcode", "")).strip()
    digits = "".join(ch for ch in postcode if ch.isdigit())
    if len(digits) == 8:
        return digits
    return None


def haversine_km(lat1, lon1, lat2, lon2):
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def geocode_address(query):
    if not query:
        return None, None
    cache_key = query.strip().lower()
    now_ts = int(time.time())
    with GEOCODE_CACHE_LOCK:
        cached = GEOCODE_CACHE.get(cache_key)
        if cached and (now_ts - cached["ts"]) < GEOCODE_CACHE_TTL_SECONDS:
            return cached["lat"], cached["lon"]

    attempts = [
        query,
        query.replace("-", " "),
        query.replace(",", " "),
    ]
    lat, lon = None, None
    for attempt in attempts:
        url = f"https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q={quote_plus(attempt)}"
        try:
            data = fetch_json(url, headers={"User-Agent": "commit-saas/1.0"}, timeout=10)
        except Exception:
            data = None
        if not data:
            continue
        lat, lon = to_float(data[0].get("lat")), to_float(data[0].get("lon"))
        if lat is not None and lon is not None:
            break

    if lat is None or lon is None:
        return None, None

    if lat is not None and lon is not None:
        with GEOCODE_CACHE_LOCK:
            GEOCODE_CACHE[cache_key] = {"lat": lat, "lon": lon, "ts": now_ts}
    return lat, lon


def lookup_cep(cep):
    normalized = "".join(ch for ch in str(cep or "") if ch.isdigit())
    if len(normalized) != 8:
        return None
    try:
        data = fetch_json(f"https://viacep.com.br/ws/{normalized}/json/", timeout=6)
    except Exception:
        data = None
    if (not data) or data.get("erro"):
        try:
            brasil = fetch_json(f"https://brasilapi.com.br/api/cep/v1/{normalized}", timeout=6)
            data = {
                "cep": brasil.get("cep", ""),
                "logradouro": brasil.get("street", ""),
                "bairro": brasil.get("neighborhood", ""),
                "localidade": brasil.get("city", ""),
                "uf": brasil.get("state", ""),
            }
        except Exception:
            return None
    if not data or data.get("erro"):
        return None
    return {
        "cep": data.get("cep", ""),
        "logradouro": data.get("logradouro", ""),
        "bairro": data.get("bairro", ""),
        "cidade": data.get("localidade", ""),
        "estado": data.get("uf", ""),
    }


def build_address_query(endereco, cep_data, cep_raw):
    parts = []
    if endereco:
        parts.append(endereco)
    if cep_data:
        parts.extend([
            cep_data.get("logradouro", ""),
            cep_data.get("bairro", ""),
            cep_data.get("cidade", ""),
            cep_data.get("estado", ""),
        ])
        if cep_data.get("cep"):
            parts.append(cep_data["cep"])
    elif cep_raw:
        parts.append(cep_raw)
    parts.append("Brasil")
    clean = [part.strip() for part in parts if str(part).strip()]
    return ", ".join(clean)


def geocode_with_fallback(endereco, cep_data, cep_raw):
    candidates = []
    primary = build_address_query(endereco, cep_data, cep_raw)
    if primary:
        candidates.append(primary)
    if cep_data:
        street_query = ", ".join(
            [p for p in [cep_data.get("logradouro", ""), cep_data.get("cidade", ""), cep_data.get("estado", ""), "Brasil"] if p]
        )
        neighborhood_query = ", ".join(
            [p for p in [cep_data.get("bairro", ""), cep_data.get("cidade", ""), cep_data.get("estado", ""), "Brasil"] if p]
        )
        city_query = ", ".join(
            [p for p in [cep_data.get("cidade", ""), cep_data.get("estado", ""), "Brasil"] if p]
        )
        for value in [street_query, neighborhood_query, city_query]:
            if value and value not in candidates:
                candidates.append(value)
    if cep_raw:
        cep_query = f"{cep_raw}, Brasil"
        if cep_query not in candidates:
            candidates.append(cep_query)

    for candidate in candidates:
        lat, lon = geocode_address(candidate)
        if lat is not None and lon is not None:
            return lat, lon, candidate
    return None, None, ""


def check_rate_limit(ip_key):
    now_ts = int(time.time())
    minute_bucket = now_ts // 60
    with GEOCODE_RATE_LIMIT_LOCK:
        record = GEOCODE_RATE_LIMIT.get(ip_key)
        if not record or record["bucket"] != minute_bucket:
            GEOCODE_RATE_LIMIT[ip_key] = {"bucket": minute_bucket, "count": 1}
            return True
        if record["count"] >= GEOCODE_RATE_LIMIT_PER_MIN:
            return False
        record["count"] += 1
        return True


def get_pizzaria_or_404(pizzaria_id):
    data = supabase.table("pizzarias").select("*").eq("id", pizzaria_id).execute().data
    if not data:
        return None
    return data[0]


@app.route("/")
def root():
    return redirect(url_for("admin_login"))


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "GET":
        return render_template("admin/login.html", erro=None)

    email = request.form.get("email", "").strip().lower()
    senha = request.form.get("senha", "")

    is_valid = False
    if ADMIN_EMAIL and ADMIN_PASSWORD_HASH:
        is_valid = email == ADMIN_EMAIL and check_password_hash(ADMIN_PASSWORD_HASH, senha)
    else:
        data = supabase.table("admin_users").select("*").eq("email", email).limit(1).execute().data
        if data:
            is_valid = check_password_hash(data[0]["password_hash"], senha)

    if not is_valid:
        return render_template("admin/login.html", erro="Email ou senha inválidos")

    session["admin_logado"] = True
    session["admin_email"] = email
    return redirect(url_for("admin_home"))


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


@app.route("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("admin_login"))


@app.route("/admin")
@login_required
def admin_home():
    pizzarias = supabase.table("pizzarias").select("*").order("created_at", desc=True).execute().data
    return render_template("admin/home.html", pizzarias=pizzarias)


@app.route("/admin/pizzaria/nova")
@login_required
def nova_pizzaria():
    return render_template("admin/nova_pizzaria.html")


@app.route("/admin/pizzaria/<pizzaria_id>/editar")
@login_required
def editar_pizzaria(pizzaria_id):
    pizzaria = get_pizzaria_or_404(pizzaria_id)
    if not pizzaria:
        return "Pizzaria não encontrada", 404
    return render_template("admin/editar_pizzaria.html", pizzaria=pizzaria)


@app.route("/admin/api/pizzarias", methods=["GET", "POST"])
@login_required
def admin_pizzarias():
    if request.method == "GET":
        items = supabase.table("pizzarias").select("*").order("created_at", desc=True).execute().data
        return jsonify(items)

    data = parse_json()
    required = ["nome", "slug", "whatsapp"]
    if any(not data.get(item) for item in required):
        return fail("Campos obrigatórios: nome, slug e whatsapp")

    payload = {
        "nome": data["nome"].strip(),
        "slug": data["slug"].strip().lower(),
        "whatsapp": data["whatsapp"].strip(),
        "cep": data.get("cep", "").strip(),
        "latitude": to_float(data.get("latitude")),
        "longitude": to_float(data.get("longitude")),
        "endereco": data.get("endereco", "").strip(),
        "banner_url": data.get("banner_url", "").strip(),
        "logo_url": data.get("logo_url", "").strip(),
        "tempo_entrega_min": int(data.get("tempo_entrega_min", 30)),
        "tempo_entrega_max": int(data.get("tempo_entrega_max", 50)),
        "horario_abertura": data.get("horario_abertura", "18:00"),
        "horario_fechamento": data.get("horario_fechamento", "23:00"),
        "status_override": data.get("status_override", "auto"),
        "cor_fundo_principal": data.get("cor_fundo_principal", "#0b0f1a"),
        "cor_fundo_secundario": data.get("cor_fundo_secundario", "#111827"),
        "cor_titulos": data.get("cor_titulos", "#f9fafb"),
        "cor_texto": data.get("cor_texto", "#e5e7eb"),
        "cor_texto_secundario": data.get("cor_texto_secundario", "#94a3b8"),
        "cor_surface": data.get("cor_surface", "#ffffff"),
        "cupons": data.get("cupons", {}),
        "botao_primario_bg": data.get("botao_primario_bg", "#ef4444"),
        "botao_primario_texto": data.get("botao_primario_texto", "#ffffff"),
        "botao_primario_hover": data.get("botao_primario_hover", "#dc2626"),
        "botao_secundario_bg": data.get("botao_secundario_bg", "#1f2937"),
        "botao_secundario_texto": data.get("botao_secundario_texto", "#ffffff"),
        "botao_secundario_hover": data.get("botao_secundario_hover", "#111827"),
        "botao_destaque_bg": data.get("botao_destaque_bg", "#f59e0b"),
        "botao_destaque_texto": data.get("botao_destaque_texto", "#111827"),
        "botao_destaque_hover": data.get("botao_destaque_hover", "#d97706"),
        "botao_neutro_bg": data.get("botao_neutro_bg", "#e5e7eb"),
        "botao_neutro_texto": data.get("botao_neutro_texto", "#111827"),
        "botao_neutro_hover": data.get("botao_neutro_hover", "#cbd5e1"),
        "texto_botao_mais": data.get("texto_botao_mais", "Mais"),
        "texto_botao_finalizar": data.get("texto_botao_finalizar", "Finalizar pedido"),
        "texto_botao_cancelar": data.get("texto_botao_cancelar", "Cancelar"),
        "texto_botao_ver_mais": data.get("texto_botao_ver_mais", "Ver mais"),
        "status": data.get("status", "ativo"),
    }
    created = supabase.table("pizzarias").insert(payload).execute().data[0]
    return ok({"item": created}, 201)


@app.route("/admin/api/pizzarias/<pizzaria_id>/cupons", methods=["PUT"])
@login_required
def admin_pizzaria_cupons(pizzaria_id):
    """Endpoint específico para salvar cupons na tabela separada"""
    data = parse_json()
    cupons = data.get("cupons", [])

    print(f"DEBUG: Salvando cupons para pizzaria {pizzaria_id}")
    print(f"DEBUG: Cupons recebidos: {cupons}")

    if not cupons:
        print("DEBUG: Lista de cupons vazia, nada para salvar")
        return ok({"message": "Nenhum cupom para salvar"})

    try:
        import requests

        supabase_url = os.environ.get('SUPABASE_URL', '')
        api_key = os.environ.get('SUPABASE_KEY', '')

        headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }

        # Inserir cupons via HTTP direto (bypass schema cache)
        insert_url = f"{supabase_url}/rest/v1/cupons"
        for cupom in cupons:
            payload = {
                "pizzaria_id": pizzaria_id,
                "codigo": cupom["codigo"],
                "valor": float(cupom["valor"]),
                "tipo": cupom.get("tipo", "fixed"),
                "oculto": bool(cupom.get("oculto", False))
            }
            response = requests.post(insert_url, json=payload, headers=headers, timeout=10)
            print(f"DEBUG: Response status: {response.status_code}")
            if response.status_code not in [200, 201, 204]:
                print(f"DEBUG: Response error: {response.text}")

        return ok({"message": "Cupons salvos com sucesso"})

    except Exception as e:
        import traceback
        print("Erro ao salvar cupons:", str(e))
        print(traceback.format_exc())
        return ok({"message": f"Erro ao salvar cupons: {str(e)}"})


@app.route("/admin/api/pizzarias/<pizzaria_id>", methods=["GET", "PUT", "DELETE"])
@login_required
def admin_pizzaria_by_id(pizzaria_id):
    if request.method == "GET":
        item = get_pizzaria_or_404(pizzaria_id)
        if not item:
            return fail("Pizzaria não encontrada", 404)

        # Buscar cupons da tabela separada
        try:
            cupons = supabase.table("cupons").select("*").eq("pizzaria_id", pizzaria_id).execute().data
            # Converter para formato esperado pelo frontend
            item["cupons"] = [
                {
                    "codigo": c["codigo"],
                    "valor": float(c["valor"]),
                    "tipo": c.get("tipo", "fixed"),
                    "oculto": bool(c.get("oculto", False))
                }
                for c in (cupons or [])
            ]
        except Exception as e:
            print("Erro ao buscar cupons:", str(e))
            item["cupons"] = []

        return jsonify(item)

    if request.method == "DELETE":
        supabase.table("pizzarias").delete().eq("id", pizzaria_id).execute()
        return ok()

    if request.method == "PUT":
        data = parse_json()
        payload = {k: v for k, v in data.items() if k != "id"}
        if "slug" in payload:
            payload["slug"] = str(payload["slug"]).strip().lower()

        # Separar cupons do payload principal
        cupons_data = payload.pop("cupons", None)

        try:
            # Atualizar dados principais da pizzaria
            updated = supabase.table("pizzarias").update(payload).eq("id", pizzaria_id).execute().data
            if not updated:
                return fail("Pizzaria não encontrada", 404)

            # Salvar cupons na tabela separada
            if cupons_data is not None:
                try:
                    # Deletar cupons existentes
                    supabase.table("cupons").delete().eq("pizzaria_id", pizzaria_id).execute()
                    # Inserir novos cupons
                    for cupom in cupons_data:
                        cupom_payload = {
                            "pizzaria_id": pizzaria_id,
                            "codigo": cupom["codigo"],
                            "valor": float(cupom["valor"]),
                            "tipo": cupom.get("tipo", "fixed"),
                            "oculto": bool(cupom.get("oculto", False))
                        }
                        supabase.table("cupons").insert(cupom_payload).execute()
                except Exception as cupom_error:
                    print("Aviso: Erro ao salvar cupons:", str(cupom_error))

            return ok({"item": updated[0]})
        except Exception as e:
            import traceback
            print("Erro ao atualizar pizzaria:", str(e))
            print(traceback.format_exc())
            return fail(f"Erro ao salvar: {str(e)}", 500)


@app.route("/admin/api/categorias", methods=["GET", "POST"])
@login_required
def admin_categorias():
    if request.method == "GET":
        pizzaria_id = request.args.get("pizzaria_id", "")
        if not pizzaria_id:
            return fail("pizzaria_id é obrigatório")

        # Buscar categorias principais (sem parent_id)
        rows = (
            supabase.table("categorias")
            .select("*")
            .eq("pizzaria_id", pizzaria_id)
            .is_("parent_id", "null")
            .order("sort_order")
            .execute()
            .data
        )

        # Buscar subcategorias para cada categoria principal
        for categoria in rows:
            subcats = (
                supabase.table("categorias")
                .select("*")
                .eq("pizzaria_id", pizzaria_id)
                .eq("parent_id", categoria["id"])
                .order("sort_order")
                .execute()
                .data
            )
            categoria["subcategorias"] = subcats

        return jsonify(rows)

    data = parse_json()
    payload = {
        "pizzaria_id": data.get("pizzaria_id"),
        "parent_id": data.get("parent_id"),  # null para categoria principal
        "nome": data.get("nome", "").strip(),
        "icone": data.get("icone", "").strip(),
        "button_variant": data.get("button_variant", "primary"),  # Corrigido para "primary"
        "sort_order": int(data.get("sort_order", 0)),
        "tipo": data.get("tipo", "principal"),  # 'principal' ou 'subcategoria'
    }
    if not payload["pizzaria_id"] or not payload["nome"]:
        return fail("pizzaria_id e nome são obrigatórios")

    # Se tiver parent_id, garantir que tipo seja 'subcategoria'
    if payload["parent_id"] and payload["tipo"] != "subcategoria":
        payload["tipo"] = "subcategoria"
    # Se não tiver parent_id, garantir que tipo seja 'principal'
    elif not payload["parent_id"] and payload["tipo"] != "principal":
        payload["tipo"] = "principal"

    print("Payload para inserir categoria:", payload)  # Debug

    row = supabase.table("categorias").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/categorias/<categoria_id>", methods=["PUT", "DELETE"])
@login_required
def admin_categoria_by_id(categoria_id):
    if request.method == "DELETE":
        supabase.table("categorias").delete().eq("id", categoria_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("categorias").update(data).eq("id", categoria_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/produtos", methods=["GET", "POST"])
@login_required
def admin_produtos():
    if request.method == "GET":
        pizzaria_id = request.args.get("pizzaria_id", "")
        categoria_id = request.args.get("categoria_id", "")
        subcategoria_id = request.args.get("subcategoria_id", "")

        query = supabase.table("produtos").select("*").eq("pizzaria_id", pizzaria_id)

        if categoria_id:
            query = query.eq("categoria_id", categoria_id)
        if subcategoria_id:
            query = query.eq("subcategoria_id", subcategoria_id)

        rows = query.order("sort_order").execute().data
        return jsonify(rows)

    data = parse_json()
    payload = {
        "pizzaria_id": data.get("pizzaria_id"),
        "categoria_id": data.get("categoria_id"),
        "subcategoria_id": data.get("subcategoria_id"),  # Nova coluna
        "nome": data.get("nome", "").strip(),
        "descricao": data.get("descricao", "").strip(),
        "preco_base": float(data.get("preco_base", 0)),
        "imagem_url": data.get("imagem_url", "").strip(),
        "ativo": bool(data.get("ativo", True)),
        "sort_order": int(data.get("sort_order", 0)),
    }
    if not payload["pizzaria_id"] or not payload["nome"]:
        return fail("pizzaria_id e nome são obrigatórios")
    row = supabase.table("produtos").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/produtos/<produto_id>", methods=["PUT", "DELETE"])
@login_required
def admin_produto_by_id(produto_id):
    if request.method == "DELETE":
        supabase.table("produtos").delete().eq("id", produto_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("produtos").update(data).eq("id", produto_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/secoes", methods=["GET", "POST"])
@login_required
def admin_secoes():
    if request.method == "GET":
        produto_id = request.args.get("produto_id", "")
        rows = supabase.table("produto_secoes").select("*").eq("produto_id", produto_id).order("sort_order").execute().data
        return jsonify(rows)

    data = parse_json()
    payload = {
        "produto_id": data.get("produto_id"),
        "nome": data.get("nome", "").strip(),
        "tipo": data.get("tipo", "single"),
        "obrigatorio": bool(data.get("obrigatorio", False)),
        "min_selecao": int(data.get("min_selecao", 0)),
        "max_selecao": int(data.get("max_selecao", 1)),
        "sort_order": int(data.get("sort_order", 0)),
    }
    if not payload["produto_id"] or not payload["nome"]:
        return fail("produto_id e nome são obrigatórios")
    row = supabase.table("produto_secoes").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/secoes/<secao_id>", methods=["PUT", "DELETE"])
@login_required
def admin_secao_by_id(secao_id):
    if request.method == "DELETE":
        supabase.table("produto_secoes").delete().eq("id", secao_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("produto_secoes").update(data).eq("id", secao_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/categoria-combos", methods=["GET", "POST"])
@login_required
def admin_categoria_combos():
    if request.method == "GET":
        pizzaria_id = request.args.get("pizzaria_id", "")
        rows = (
            supabase.table("categoria_combos")
            .select("*")
            .eq("pizzaria_id", pizzaria_id)
            .order("sort_order")
            .execute()
            .data
        )
        return jsonify(rows)

    data = parse_json()
    payload = {
        "pizzaria_id": data.get("pizzaria_id"),
        "categoria_origem_id": data.get("categoria_origem_id"),
        "categoria_destino_id": data.get("categoria_destino_id"),
        "ativo": bool(data.get("ativo", True)),
        "sort_order": int(data.get("sort_order", 0)),
    }
    if not payload["pizzaria_id"] or not payload["categoria_origem_id"] or not payload["categoria_destino_id"]:
        return fail("pizzaria_id, categoria_origem_id e categoria_destino_id são obrigatórios")
    row = supabase.table("categoria_combos").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/categoria-combos/<combo_id>", methods=["PUT", "DELETE"])
@login_required
def admin_categoria_combo_by_id(combo_id):
    if request.method == "DELETE":
        supabase.table("categoria_combos").delete().eq("id", combo_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("categoria_combos").update(data).eq("id", combo_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/subcategoria-combos", methods=["GET", "POST"])
@login_required
def admin_subcategoria_combos():
    if request.method == "GET":
        pizzaria_id = request.args.get("pizzaria_id", "")
        rows = (
            supabase.table("subcategoria_combos")
            .select("*")
            .eq("pizzaria_id", pizzaria_id)
            .order("sort_order")
            .execute()
            .data
        )
        return jsonify(rows)

    data = parse_json()
    payload = {
        "pizzaria_id": data.get("pizzaria_id"),
        "subcategoria_origem_id": data.get("subcategoria_origem_id"),
        "subcategoria_destino_id": data.get("subcategoria_destino_id"),
        "ativo": bool(data.get("ativo", True)),
        "sort_order": int(data.get("sort_order", 0)),
    }
    if not payload["pizzaria_id"] or not payload["subcategoria_origem_id"] or not payload["subcategoria_destino_id"]:
        return fail("pizzaria_id, subcategoria_origem_id e subcategoria_destino_id são obrigatórios")
    row = supabase.table("subcategoria_combos").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/subcategoria-combos/<combo_id>", methods=["PUT", "DELETE"])
@login_required
def admin_subcategoria_combo_by_id(combo_id):
    if request.method == "DELETE":
        supabase.table("subcategoria_combos").delete().eq("id", combo_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("subcategoria_combos").update(data).eq("id", combo_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/sugestao-config", methods=["GET", "POST"])
@login_required
def admin_sugestao_config():
    if request.method == "GET":
        pizzaria_id = request.args.get("pizzaria_id", "")
        rows = (
            supabase.table("sugestao_config")
            .select("*")
            .eq("pizzaria_id", pizzaria_id)
            .order("sort_order")
            .execute()
            .data
        )
        return jsonify(rows)

    data = parse_json()
    payload = {
        "pizzaria_id": data.get("pizzaria_id"),
        "categoria_id": data.get("categoria_id"),
        "ativo": bool(data.get("ativo", True)),
        "sort_order": int(data.get("sort_order", 0)),
    }
    if not payload["pizzaria_id"] or not payload["categoria_id"]:
        return fail("pizzaria_id e categoria_id são obrigatórios")
    row = supabase.table("sugestao_config").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/sugestao-config/<config_id>", methods=["PUT", "DELETE"])
@login_required
def admin_sugestao_config_by_id(config_id):
    if request.method == "DELETE":
        supabase.table("sugestao_config").delete().eq("id", config_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("sugestao_config").update(data).eq("id", config_id).execute().data[0]
    return ok({"item": row})


@app.route("/api/sugestao-combo/<slug>", methods=["POST"])
def api_sugestao_combo(slug):
    """API para gerar sugestão de pedido baseada em combos"""
    print(f"=== DEBUG: Recebida requisição de sugestão para slug: {slug}")  # Debug

    rows = supabase.table("pizzarias").select("*").eq("slug", slug).limit(1).execute().data
    if not rows:
        return fail("Pizzaria não encontrada", 404)
    pizzaria = rows[0]

    payload = parse_json()
    categoria_escolhida_id = payload.get("categoria_id")
    print(f"=== DEBUG: Categoria escolhida: {categoria_escolhida_id}")  # Debug

    if not categoria_escolhida_id:
        return fail("categoria_id é obrigatório")

    # Buscar configurações de sugestão ativas
    config_sugestao = (
        supabase.table("sugestao_config")
        .select("*, categorias(*)")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .execute()
        .data
    )
    print(f"=== DEBUG: Config sugestão encontrada: {len(config_sugestao)} configurações")  # Debug

    # Buscar combos de categorias
    categoria_combos = (
        supabase.table("categoria_combos")
        .select("*, categoria_origem:categoria_origem_id(*), categoria_destino:categoria_destino_id(*)")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .execute()
        .data
    )
    print(f"=== DEBUG: Categoria combos encontrados: {len(categoria_combos)}")  # Debug

    # Buscar combos de subcategorias (se existirem)
    subcategoria_combos = (
        supabase.table("subcategoria_combos")
        .select("*, subcategoria_origem:subcategoria_origem_id(*), subcategoria_destino:subcategoria_destino_id(*)")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .execute()
        .data
    )

    # Encontrar categorias que combinam com a escolhida
    categorias_combinam = []
    print(f"=== DEBUG: Procurando combos para categoria {categoria_escolhida_id}")  # Debug

    for combo in categoria_combos:
        origem_id = combo["categoria_origem"]["id"]
        destino_id = combo["categoria_destino"]["id"]
        print(f"=== DEBUG: Verificando combo: {origem_id} -> {destino_id}")  # Debug

        if origem_id == categoria_escolhida_id:
            categorias_combinam.append(combo["categoria_destino"])
            print(f"=== DEBUG: Encontrada combinação: {combo['categoria_destino']['nome']}")  # Debug
        elif destino_id == categoria_escolhida_id:
            categorias_combinam.append(combo["categoria_origem"])
            print(f"=== DEBUG: Encontrada combinação: {combo['categoria_origem']['nome']}")  # Debug

    print(f"=== DEBUG: Total de categorias que combinam: {len(categorias_combinam)}")  # Debug

    # Buscar produtos das categorias que combinam
    if not categorias_combinam:
        return fail("Nenhuma combinação encontrada para esta categoria")

    categoria_ids = [cat["id"] for cat in categorias_combinam]
    produtos = (
        supabase.table("produtos")
        .select("*")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .in_("categoria_id", categoria_ids)
        .execute()
        .data
    )

    # Sortear produtos aleatórios (máximo 3 por categoria)
    import random
    produtos_sugeridos = []
    produtos_por_categoria = {}

    # Agrupar produtos por categoria
    for produto in produtos:
        cat_id = produto["categoria_id"]
        if cat_id not in produtos_por_categoria:
            produtos_por_categoria[cat_id] = []
        produtos_por_categoria[cat_id].append(produto)

    # Sortear até 3 produtos por categoria
    for cat_id, produtos_cat in produtos_por_categoria.items():
        if len(produtos_cat) > 3:
            produtos_sorteados = random.sample(produtos_cat, 3)
        else:
            produtos_sorteados = produtos_cat
        produtos_sugeridos.extend(produtos_sorteados)

    # Buscar seções e opções dos produtos sugeridos
    if produtos_sugeridos:
        produto_ids = [p["id"] for p in produtos_sugeridos]
        secoes = (
            supabase.table("produto_secoes")
            .select("*")
            .in_("produto_id", produto_ids)
            .order("sort_order")
            .execute()
            .data
        )
        secao_ids = [s["id"] for s in secoes]
        opcoes = []
        if secao_ids:
            opcoes = (
                supabase.table("produto_opcoes")
                .select("*")
                .in_("secao_id", secao_ids)
                .eq("ativo", True)
                .order("sort_order")
                .execute()
                .data
            )

        # Organizar seções e opções
        opcoes_por_secao = {}
        for opcao in opcoes:
            secao_id = opcao["secao_id"]
            if secao_id not in opcoes_por_secao:
                opcoes_por_secao[secao_id] = []
            opcoes_por_secao[secao_id].append(opcao)

        secoes_por_produto = {}
        for secao in secoes:
            produto_id = secao["produto_id"]
            if produto_id not in secoes_por_produto:
                secoes_por_produto[produto_id] = []
            secao["opcoes"] = opcoes_por_secao.get(secao["id"], [])
            secoes_por_produto[produto_id].append(secao)

        for produto in produtos_sugeridos:
            produto["secoes"] = secoes_por_produto.get(produto["id"], [])

    return ok({
        "produtos": produtos_sugeridos,
        "categorias_origem": [cat for cat in categorias_combinam],
        "mensagem": f"Combinações com {next((cat['nome'] for cat in config_sugestao if cat['categoria_id'] == categoria_escolhida_id), 'categoria escolhida')}"
    })


@app.route("/admin/api/opcoes", methods=["GET", "POST"])
@login_required
def admin_opcoes():
    if request.method == "GET":
        secao_id = request.args.get("secao_id", "")
        rows = supabase.table("produto_opcoes").select("*").eq("secao_id", secao_id).order("sort_order").execute().data
        return jsonify(rows)

    data = parse_json()
    payload = {
        "secao_id": data.get("secao_id"),
        "nome": data.get("nome", "").strip(),
        "preco_adicional": float(data.get("preco_adicional", 0)),
        "sort_order": int(data.get("sort_order", 0)),
        "ativo": bool(data.get("ativo", True)),
    }
    if not payload["secao_id"] or not payload["nome"]:
        return fail("secao_id e nome são obrigatórios")
    row = supabase.table("produto_opcoes").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/opcoes/<opcao_id>", methods=["PUT", "DELETE"])
@login_required
def admin_opcao_by_id(opcao_id):
    if request.method == "DELETE":
        supabase.table("produto_opcoes").delete().eq("id", opcao_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("produto_opcoes").update(data).eq("id", opcao_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/frete-regras", methods=["GET", "POST"])
@login_required
def admin_frete_regras():
    if request.method == "GET":
        pizzaria_id = request.args.get("pizzaria_id", "")
        rows = supabase.table("frete_regras").select("*").eq("pizzaria_id", pizzaria_id).order("sort_order").execute().data
        return jsonify(rows)

    data = parse_json()
    payload = {
        "pizzaria_id": data.get("pizzaria_id"),
        "distancia_km_min": float(data.get("distancia_km_min", 0)),
        "distancia_km_max": float(data.get("distancia_km_max", 0)),
        "valor": float(data.get("valor", 0)),
        "sort_order": int(data.get("sort_order", 0)),
        "ativo": bool(data.get("ativo", True)),
    }
    if not payload["pizzaria_id"]:
        return fail("pizzaria_id é obrigatório")
    row = supabase.table("frete_regras").insert(payload).execute().data[0]
    return ok({"item": row}, 201)


@app.route("/admin/api/frete-regras/<regra_id>", methods=["PUT", "DELETE"])
@login_required
def admin_frete_regra_by_id(regra_id):
    if request.method == "DELETE":
        supabase.table("frete_regras").delete().eq("id", regra_id).execute()
        return ok()
    data = parse_json()
    row = supabase.table("frete_regras").update(data).eq("id", regra_id).execute().data[0]
    return ok({"item": row})


@app.route("/admin/api/reorder", methods=["POST"])
@login_required
def admin_reorder():
    data = parse_json()
    entity = data.get("entity", "")
    items = data.get("items", [])
    table_by_entity = {
        "categorias": "categorias",
        "produtos": "produtos",
        "secoes": "produto_secoes",
        "opcoes": "produto_opcoes",
        "frete": "frete_regras",
    }
    table_name = table_by_entity.get(entity)
    if not table_name:
        return fail("entity inválida")
    if not isinstance(items, list):
        return fail("items deve ser lista")

    for item in items:
        row_id = item.get("id")
        sort_order = int(item.get("sort_order", 0))
        if not row_id:
            continue
        supabase.table(table_name).update({"sort_order": sort_order}).eq("id", row_id).execute()
    return ok()


@app.route("/api/frete/calcular/<slug>", methods=["POST"])
def calcular_frete(slug):
    rows = supabase.table("pizzarias").select("*").eq("slug", slug).limit(1).execute().data
    if not rows:
        return fail("Pizzaria não encontrada", 404)
    pizzaria = rows[0]
    payload = parse_json()
    request_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    if not check_rate_limit(f"frete:{request_ip}"):
        return fail("Muitas tentativas. Aguarde 1 minuto.", 429)
    cep = (payload.get("cep") or "").strip()
    endereco = (payload.get("endereco") or "").strip()
    if not cep and not endereco:
        return fail("Informe CEP ou endereço")

    loja_lat = to_float(pizzaria.get("latitude"))
    loja_lon = to_float(pizzaria.get("longitude"))
    if loja_lat is None or loja_lon is None:
        return fail("Configure latitude e longitude da pizzaria no painel admin")

    via_cep = lookup_cep(cep) if cep else None
    if via_cep:
        # CEP válido é fonte canônica para evitar associação errada.
        cliente_lat, cliente_lon, used_query = geocode_with_fallback("", via_cep, cep)
    else:
        # Sem CEP válido, tenta pelo endereço informado.
        cliente_lat, cliente_lon, used_query = geocode_with_fallback(endereco, None, "")
    if cliente_lat is None or cliente_lon is None:
        return fail("Não foi possível localizar o endereço informado", 422)

    distancia = haversine_km(loja_lat, loja_lon, cliente_lat, cliente_lon)
    regras = (
        supabase.table("frete_regras")
        .select("*")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .order("sort_order")
        .execute()
        .data
    )
    frete = None
    for regra in regras:
        min_km = to_float(regra.get("distancia_km_min")) or 0
        max_km = to_float(regra.get("distancia_km_max")) or 0
        if distancia >= min_km and distancia <= max_km:
            frete = to_float(regra.get("valor")) or 0
            break
    if frete is None:
        return fail("Endereço fora da área de entrega", 422)
    return ok({
        "distancia_km": round(distancia, 2),
        "frete": round(frete, 2),
        "cep_encontrado": via_cep or {},
        "query_usada": used_query,
    })


@app.route("/admin/api/geocode", methods=["POST"])
@login_required
def admin_geocode():
    payload = parse_json()
    request_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    if not check_rate_limit(f"admin-geocode:{request_ip}"):
        return fail("Muitas tentativas. Aguarde 1 minuto.", 429)
    endereco = (payload.get("endereco") or "").strip()
    cep = (payload.get("cep") or "").strip()
    if not endereco and not cep:
        return fail("Informe endereco ou CEP")
    via_cep = lookup_cep(cep) if cep else None
    lat, lon, used_query = geocode_with_fallback(endereco, via_cep, cep)
    if lat is None or lon is None:
        return fail("Nao foi possivel geocodificar este endereco", 422)
    return ok({"latitude": lat, "longitude": lon, "cep_encontrado": via_cep or {}, "query_usada": used_query})


@app.route("/api/cep/<cep>", methods=["GET"])
def api_lookup_cep(cep):
    data = lookup_cep(cep)
    if not data:
        return fail("CEP nao encontrado", 404)
    return ok({"cep": data})


@app.route("/api/cep/buscar-por-endereco", methods=["POST"])
def api_lookup_cep_by_address():
    payload = parse_json()
    endereco = (payload.get("endereco") or "").strip()
    if not endereco:
        return fail("Informe o endereco")
    cep = reverse_geocode_postcode(f"{endereco}, Brasil")
    if not cep:
        return fail("Nao foi possivel identificar CEP para este endereco", 404)
    details = lookup_cep(cep)
    if not details:
        return fail("CEP encontrado, mas sem detalhes", 404)
    return ok({"cep": details})


@app.route("/admin/api/cep/<cep>", methods=["GET"])
@login_required
def admin_api_lookup_cep(cep):
    data = lookup_cep(cep)
    if not data:
        return fail("CEP nao encontrado", 404)
    return ok({"cep": data})


@app.route("/<slug>")
def pizzaria_public(slug):
    rows = supabase.table("pizzarias").select("*").eq("slug", slug).limit(1).execute().data
    if not rows:
        return "Pizzaria não encontrada", 404
    pizzaria = rows[0]

    # Buscar categorias principais com subcategorias
    categorias_principais = (
        supabase.table("categorias")
        .select("*")
        .eq("pizzaria_id", pizzaria["id"])
        .is_("parent_id", "null")
        .order("sort_order")
        .execute()
        .data
    )

    # Buscar subcategorias e organizar estrutura hierárquica
    categorias = []
    for categoria in categorias_principais:
        subcats = (
            supabase.table("categorias")
            .select("*")
            .eq("pizzaria_id", pizzaria["id"])
            .eq("parent_id", categoria["id"])
            .order("sort_order")
            .execute()
            .data
        )

        # Adiciona categoria principal com suas subcategorias
        categoria_completa = dict(categoria)
        categoria_completa["subcategorias"] = subcats
        categorias.append(categoria_completa)

        # Adiciona subcategorias como itens separados na lista para renderização
        for subcat in subcats:
            categorias.append(dict(subcat))

    produtos = (
        supabase.table("produtos")
        .select("*")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .order("sort_order")
        .execute()
        .data
    )
    frete_regras = (
        supabase.table("frete_regras")
        .select("*")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("ativo", True)
        .order("sort_order")
        .execute()
        .data
    )
    cupons = (
        supabase.table("cupons")
        .select("*")
        .eq("pizzaria_id", pizzaria["id"])
        .eq("oculto", False)
        .execute()
        .data
    )

    produto_ids = [item["id"] for item in produtos]
    secoes = []
    opcoes = []
    if produto_ids:
        secoes = (
            supabase.table("produto_secoes")
            .select("*")
            .in_("produto_id", produto_ids)
            .order("sort_order")
            .execute()
            .data
        )
        secao_ids = [item["id"] for item in secoes]
        if secao_ids:
            opcoes = (
                supabase.table("produto_opcoes")
                .select("*")
                .in_("secao_id", secao_ids)
                .eq("ativo", True)
                .order("sort_order")
                .execute()
                .data
            )

    opcoes_por_secao = {}
    for opcao in opcoes:
        secao_id = opcao["secao_id"]
        if secao_id not in opcoes_por_secao:
            opcoes_por_secao[secao_id] = []
        opcoes_por_secao[secao_id].append(opcao)

    secoes_por_produto = {}
    for secao in secoes:
        produto_id = secao["produto_id"]
        if produto_id not in secoes_por_produto:
            secoes_por_produto[produto_id] = []
        secao["opcoes"] = opcoes_por_secao.get(secao["id"], [])
        secoes_por_produto[produto_id].append(secao)

    for produto in produtos:
        produto["secoes"] = secoes_por_produto.get(produto["id"], [])

    # Add cupons to pizzaria object
    pizzaria["cupons"] = cupons

    return render_template(
        "index.html",
        pizzaria=pizzaria,
        categorias=categorias,
        produtos=produtos,
        frete_regras=frete_regras,
        aberta=is_open_now(pizzaria),
        agora=datetime.now().strftime("%H:%M"),
    )


# ============================================
# ENDPOINTS PAINEL ADMIN MASTER - NOVAS FUNCIONALIDADES
# ============================================

@app.route("/admin/api/pizzarias/<pizzaria_id>/duplicar", methods=["POST"])
@login_required
def duplicar_pizzaria(pizzaria_id):
    """Duplicar uma pizzaria existente"""
    try:
        print(f"=== DEBUG DUPLICAR: Recebida requisição para pizzaria_id: {pizzaria_id}")

        # TESTE: Verificar conexão com Supabase
        print("=== TESTE: Verificando conexão com Supabase...")
        test_connection = supabase.table("pizzarias").select("id").limit(1).execute()
        print(f"=== TESTE: Resultado conexão: {test_connection}")

        # Buscar pizzaria original
        original = get_pizzaria_or_404(pizzaria_id)
        if not original:
            print(f"=== ERRO: Pizzaria não encontrada: {pizzaria_id}")
            return fail("Pizzaria não encontrada", 404)

        print(f"=== DEBUG: Pizzaria original encontrada: {original['nome']}")

        data = parse_json()
        print(f"=== DEBUG: Payload recebido: {data}")

        novo_nome = data.get("nome", f"{original['nome']} - Cópia")
        novo_slug = data.get("slug", f"{original['slug']}-copia")

        print(f"=== DEBUG: Novo nome: {novo_nome}")
        print(f"=== DEBUG: Novo slug: {novo_slug}")

        # Verificar se slug já existe
        slug_exists = supabase.table("pizzarias").select("id").eq("slug", novo_slug).execute().data
        if slug_exists:
            print(f"=== ERRO: Slug já existe: {novo_slug}")
            return fail("Slug já existe, escolha outro")

        print(f"=== DUPLICANDO PIZZARIA: {original['nome']} -> {novo_nome}")

        # 1. Criar nova pizzaria
        nova_pizzaria = {
            "nome": novo_nome,
            "slug": novo_slug,
            "whatsapp": original["whatsapp"],
            "cep": original.get("cep", ""),
            "latitude": original.get("latitude"),
            "longitude": original.get("longitude"),
            "endereco": original.get("endereco", ""),
            "banner_url": original.get("banner_url", ""),
            "logo_url": original.get("logo_url", ""),
            "tempo_entrega_min": original.get("tempo_entrega_min", 30),
            "tempo_entrega_max": original.get("tempo_entrega_max", 50),
            "horario_abertura": original.get("horario_abertura", "18:00"),
            "horario_fechamento": original.get("horario_fechamento", "23:00"),
            "status_override": original.get("status_override", "auto"),
            "cor_fundo_principal": original.get("cor_fundo_principal", "#0b0f1a"),
            "cor_fundo_secundario": original.get("cor_fundo_secundario", "#111827"),
            "cor_titulos": original.get("cor_titulos", "#f9fafb"),
            "cor_texto": original.get("cor_texto", "#e5e7eb"),
            "cor_texto_secundario": original.get("cor_texto_secundario", "#94a3b8"),
            "cor_surface": original.get("cor_surface", "#ffffff"),
            "botao_primario_bg": original.get("botao_primario_bg", "#ef4444"),
            "botao_primario_texto": original.get("botao_primario_texto", "#ffffff"),
            "botao_primario_hover": original.get("botao_primario_hover", "#dc2626"),
            "botao_secundario_bg": original.get("botao_secundario_bg", "#1f2937"),
            "botao_secundario_texto": original.get("botao_secundario_texto", "#ffffff"),
            "botao_secundario_hover": original.get("botao_secundario_hover", "#111827"),
            "botao_destaque_bg": original.get("botao_destaque_bg", "#f59e0b"),
            "botao_destaque_texto": original.get("botao_destaque_texto", "#111827"),
            "botao_destaque_hover": original.get("botao_destaque_hover", "#d97706"),
            "botao_neutro_bg": original.get("botao_neutro_bg", "#e5e7eb"),
            "botao_neutro_texto": original.get("botao_neutro_texto", "#111827"),
            "botao_neutro_hover": original.get("botao_neutro_hover", "#cbd5e1"),
            "texto_botao_mais": original.get("texto_botao_mais", "Mais"),
            "texto_botao_finalizar": original.get("texto_botao_finalizar", "Finalizar pedido"),
            "texto_botao_cancelar": original.get("texto_botao_cancelar", "Cancelar"),
            "texto_botao_ver_mais": original.get("texto_botao_ver_mais", "Ver mais"),
            "status": "ativo"
        }

        nova_pizzaria_criada = supabase.table("pizzarias").insert(nova_pizzaria).execute().data[0]
        nova_pizzaria_id = nova_pizzaria_criada["id"]

        print(f"Nova pizzaria criada: {nova_pizzaria_id}")

        # 2. Copiar categorias e subcategorias
        categorias_originais = supabase.table("categorias").select("*").eq("pizzaria_id", pizzaria_id).execute().data
        categorias_mapeamento = {}  # antigo_id -> novo_id

        for categoria in categorias_originais:
            nova_categoria = {
                "pizzaria_id": nova_pizzaria_id,
                "parent_id": None,  # Será ajustado depois
                "nome": categoria["nome"],
                "icone": categoria.get("icone", ""),
                "button_variant": categoria.get("button_variant", "primary"),
                "tipo": categoria.get("tipo", "principal"),
                "sort_order": categoria.get("sort_order", 0)
            }
            nova_categoria_criada = supabase.table("categorias").insert(nova_categoria).execute().data[0]
            categorias_mapeamento[categoria["id"]] = nova_categoria_criada["id"]

        # Ajustar parent_id das subcategorias
        for categoria in categorias_originais:
            if categoria.get("parent_id"):
                novo_parent_id = categorias_mapeamento.get(categoria["parent_id"])
                if novo_parent_id:
                    supabase.table("categorias").update({"parent_id": novo_parent_id}).eq("id", categorias_mapeamento[categoria["id"]]).execute()

        print(f"Categorias copiadas: {len(categorias_originais)}")

        # 3. Copiar produtos
        produtos_originais = supabase.table("produtos").select("*").eq("pizzaria_id", pizzaria_id).execute().data
        produtos_mapeamento = {}  # antigo_id -> novo_id

        for produto in produtos_originais:
            # Mapear categoria_id para o novo ID
            nova_categoria_id = categorias_mapeamento.get(produto["categoria_id"])
            if not nova_categoria_id:
                continue  # Pular se não encontrar a categoria

            novo_produto = {
                "pizzaria_id": nova_pizzaria_id,
                "categoria_id": nova_categoria_id,
                "subcategoria_id": categorias_mapeamento.get(produto["subcategoria_id"]) if produto.get("subcategoria_id") else None,
                "nome": produto["nome"],
                "descricao": produto.get("descricao", ""),
                "preco_base": produto["preco_base"],
                "imagem_url": produto.get("imagem_url", ""),
                "ativo": produto.get("ativo", True),
                "sort_order": produto.get("sort_order", 0)
            }
            novo_produto_criado = supabase.table("produtos").insert(novo_produto).execute().data[0]
            produtos_mapeamento[produto["id"]] = novo_produto_criado["id"]

        print(f"Produtos copiados: {len(produtos_originais)}")

        # 4. Copiar seções e opções dos produtos
        secoes_originais = supabase.table("produto_secoes").select("*").in_("produto_id", [p["id"] for p in produtos_originais]).execute().data
        secoes_mapeamento = {}  # antigo_id -> novo_id

        for secao in secoes_originais:
            novo_produto_id = produtos_mapeamento.get(secao["produto_id"])
            if not novo_produto_id:
                continue

            nova_secao = {
                "produto_id": novo_produto_id,
                "nome": secao["nome"],
                "tipo": secao.get("tipo", "radio"),
                "obrigatorio": secao.get("obrigatorio", False),
                "min_selecao": secao.get("min_selecao", 0),
                "max_selecao": secao.get("max_selecao", 1),
                "sort_order": secao.get("sort_order", 0)
            }
            nova_secao_criada = supabase.table("produto_secoes").insert(nova_secao).execute().data[0]
            secoes_mapeamento[secao["id"]] = nova_secao_criada["id"]

        # Copiar opções das seções
        opcoes_originais = supabase.table("produto_opcoes").select("*").in_("secao_id", [s["id"] for s in secoes_originais]).execute().data

        for opcao in opcoes_originais:
            nova_secao_id = secoes_mapeamento.get(opcao["secao_id"])
            if not nova_secao_id:
                continue

            nova_opcao = {
                "secao_id": nova_secao_id,
                "nome": opcao["nome"],
                "preco_adicional": opcao.get("preco_adicional", 0),
                "sort_order": opcao.get("sort_order", 0),
                "ativo": opcao.get("ativo", True)
            }
            supabase.table("produto_opcoes").insert(nova_opcao).execute()

        print(f"Seções e opções copiadas: {len(secoes_originais)} seções, {len(opcoes_originais)} opções")

        # 5. Copiar regras de combo
        categoria_combos = supabase.table("categoria_combos").select("*").eq("pizzaria_id", pizzaria_id).execute().data

        for combo in categoria_combos:
            nova_origem_id = categorias_mapeamento.get(combo["categoria_origem_id"])
            novo_destino_id = categorias_mapeamento.get(combo["categoria_destino_id"])
            if nova_origem_id and novo_destino_id:
                novo_combo = {
                    "pizzaria_id": nova_pizzaria_id,
                    "categoria_origem_id": nova_origem_id,
                    "categoria_destino_id": novo_destino_id,
                    "ativo": combo.get("ativo", True)
                }
                supabase.table("categoria_combos").insert(novo_combo).execute()

        subcategoria_combos = supabase.table("subcategoria_combos").select("*").eq("pizzaria_id", pizzaria_id).execute().data

        for combo in subcategoria_combos:
            nova_origem_id = categorias_mapeamento.get(combo["subcategoria_origem_id"])
            novo_destino_id = categorias_mapeamento.get(combo["subcategoria_destino_id"])
            if nova_origem_id and novo_destino_id:
                novo_combo = {
                    "pizzaria_id": nova_pizzaria_id,
                    "subcategoria_origem_id": nova_origem_id,
                    "subcategoria_destino_id": novo_destino_id,
                    "ativo": combo.get("ativo", True)
                }
                supabase.table("subcategoria_combos").insert(novo_combo).execute()

        print(f"Combos copiados: {len(categoria_combos)} categorias, {len(subcategoria_combos)} subcategorias")

        # 6. Copiar configurações de sugestão
        sugestao_config = supabase.table("sugestao_config").select("*").eq("pizzaria_id", pizzaria_id).execute().data

        for config in sugestao_config:
            nova_categoria_id = categorias_mapeamento.get(config["categoria_id"])
            if nova_categoria_id:
                nova_config = {
                    "pizzaria_id": nova_pizzaria_id,
                    "categoria_id": nova_categoria_id,
                    "ativo": config.get("ativo", True)
                }
                supabase.table("sugestao_config").insert(nova_config).execute()

        print(f"Configurações de sugestão copiadas: {len(sugestao_config)}")

        # 7. Copiar regras de frete
        frete_regras = supabase.table("frete_regras").select("*").eq("pizzaria_id", pizzaria_id).execute().data

        for regra in frete_regras:
            nova_regra = {
                "pizzaria_id": nova_pizzaria_id,
                "distancia_km_min": regra["distancia_km_min"],
                "distancia_km_max": regra["distancia_km_max"],
                "valor": regra["valor"]
            }
            supabase.table("frete_regras").insert(nova_regra).execute()

        print(f"Regras de frete copiadas: {len(frete_regras)}")

        print(f"=== DUPLICAÇÃO CONCLUÍDA: {nova_pizzaria_id}")

        return ok({
            "message": "Pizzaria duplicada com sucesso",
            "nova_pizzaria": nova_pizzaria_criada
        }, 201)

    except Exception as e:
        print(f"ERRO AO DUPLICAR PIZZARIA: {e}")
        return fail(f"Erro ao duplicar pizzaria: {str(e)}")


@app.route("/admin/api/pizzarias/<pizzaria_id>/status", methods=["PUT"])
@login_required
def toggle_pizzaria_status(pizzaria_id):
    """Ativar ou desativar uma pizzaria"""
    try:
        print(f"=== DEBUG TOGGLE STATUS: Recebida requisição para pizzaria_id: {pizzaria_id}")

        pizzaria = get_pizzaria_or_404(pizzaria_id)
        if not pizzaria:
            print(f"=== ERRO: Pizzaria não encontrada: {pizzaria_id}")
            return fail("Pizzaria não encontrada", 404)

        print(f"=== DEBUG: Pizzaria encontrada: {pizzaria['nome']}")

        data = parse_json()
        print(f"=== DEBUG: Payload recebido: {data}")

        novo_status = data.get("status")
        print(f"=== DEBUG: Status extraído: {novo_status}")

        if not novo_status:
            print(f"=== ERRO: Status não fornecido no payload")
            return fail("Status é obrigatório")

        if novo_status not in ["ativo", "desativado"]:
            print(f"=== ERRO: Status inválido: {novo_status}")
            return fail("Status inválido. Use 'ativo' ou 'desativado'")

        # Atualizar status
        result = supabase.table("pizzarias").update({"status": novo_status}).eq("id", pizzaria_id).execute()
        print(f"=== DEBUG: Resultado update: {result}")

        print(f"Status da pizzaria {pizzaria_id} atualizado para: {novo_status}")

        return ok({
            "message": f"Pizzaria {novo_status} com sucesso",
            "status": novo_status
        })

    except Exception as e:
        print(f"ERRO AO ATUALIZAR STATUS: {e}")
        import traceback
        traceback.print_exc()
        return fail(f"Erro ao atualizar status: {str(e)}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
