FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY backend ./backend
COPY static ./static
RUN mkdir -p /app/data

ENV DB_PATH=/app/data/shams.db PORT=8000
EXPOSE 8000
CMD ["waitress-serve", "--listen=0.0.0.0:8000", "--threads=8", "--chdir=backend", "app:app"]
