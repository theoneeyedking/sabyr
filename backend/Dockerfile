# Контекст сборки — корень репозитория (backend использует пакет ml/sabyr_ml и артефакты модели).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# libgomp нужен LightGBM; ставим, только если его ещё нет в базовом образе
RUN python -c "import ctypes; ctypes.CDLL('libgomp.so.1')" 2>/dev/null \
    || (apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*)
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY ml/pyproject.toml /app/ml/pyproject.toml
COPY ml/sabyr_ml /app/ml/sabyr_ml
COPY ml/artifacts /app/ml/artifacts
RUN pip install --no-cache-dir --no-deps -e /app/ml
COPY backend /app/backend
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn sabyr.wsgi -b 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120"]
