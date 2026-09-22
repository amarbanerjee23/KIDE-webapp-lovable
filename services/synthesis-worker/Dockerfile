FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && addgroup --system --gid 10001 kide \
 && adduser --system --uid 10001 --ingroup kide --home /app kide

COPY --chown=10001:10001 kide_worker ./kide_worker
USER 10001
EXPOSE 8080
CMD ["uvicorn", "kide_worker.api:app", "--host", "0.0.0.0", "--port", "8080"]
