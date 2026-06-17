FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir . "tzlocal>=5.2,<5.4"

COPY . .

EXPOSE 8000

# Default command runs the web server; the worker service overrides this in
# docker-compose with `python -m app.workers.runtime`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
