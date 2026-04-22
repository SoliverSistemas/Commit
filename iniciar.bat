@echo off
echo ==========================================
echo  PIZZARIA SAAS - INICIALIZADOR
echo ==========================================
echo.

REM Verificar se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    echo Instale o Python 3.8 ou superior
    pause
    exit /b 1
)

echo [OK] Python detectado
echo.

REM Verificar arquivo .env
if not exist .env (
    echo [AVISO] Arquivo .env nao encontrado!
    echo Criando .env padrao...
    (
        echo SUPABASE_URL=sua_url_supabase
        echo SUPABASE_KEY=sua_chave_supabase
        echo SECRET_KEY=chave_secreta_segura
        echo FLASK_DEBUG=True
    ) > .env
    echo [OK] Arquivo .env criado. EDITE com suas credenciais!
    echo.
)

REM Instalar dependencias se necessario
echo Verificando dependencias...
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias...
    pip install flask python-dotenv supabase
)

echo [OK] Dependencias OK
echo.
echo ==========================================
echo  INICIANDO SISTEMA...
echo ==========================================
echo.
echo Acesse: http://localhost:5000
echo.
echo Painel Admin: http://localhost:5000/admin/login
echo Painel Pizzaria: http://localhost:5000/pizzaria/login
echo.

python run.py

pause
