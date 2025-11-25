FROM python:3.12-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 80

# prod build
FROM base AS prod
CMD ["uvicorn", "main:app", "--host", "0.0.0" , "--port", "80", "--ws-per-message-deflate=false"]


#hor reload
FROM base AS dev
CMD ["uvicorn", "main:app", "--host", "0.0.0" , "--port", "80", "--reload", "--ws-per-message-deflate=false"]