FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /service
COPY knowledge/python-service ./knowledge-service
WORKDIR /service/knowledge-service
RUN pip install --no-cache-dir .
COPY knowledge/ontology /knowledge/ontology
COPY knowledge/rules /knowledge/rules
RUN useradd --create-home --uid 10001 kide
USER 10001
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
