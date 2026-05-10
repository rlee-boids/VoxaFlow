FROM docker.io/vllm/vllm-openai:latest
WORKDIR /app
# No vllm-omni — standard instruct models only (Qwen2.5-14B-Instruct, Llama-3.x-8B, etc.)
# Mock server fallback for environments without GPU (Mac mini dev)
COPY serve.sh /app/serve.sh
COPY mock_server.py /app/mock_server.py
RUN chmod +x /app/serve.sh
EXPOSE 8000
ENTRYPOINT ["/app/serve.sh"]
CMD []
