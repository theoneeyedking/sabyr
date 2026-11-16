"""Сервер своей модели ассистента: базовая модель + LoRA-адаптер, OpenAI-совместимый эндпоинт.

    SABYR_ADAPTER_DIR=llm/out/sabyr-assistant uvicorn llm.serve:app --host 0.0.0.0 --port 8001

Backend обращается сюда при LLM_PROVIDER=own (OWN_LLM_URL=http://llm:8001/v1).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from peft import PeftModel
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

ADAPTER_DIR = Path(os.environ.get("SABYR_ADAPTER_DIR", Path(__file__).resolve().parent / "out" / "sabyr-assistant"))
app = FastAPI(title="Sabyr assistant (own model)")
state: dict = {}


def load() -> None:
    if not (ADAPTER_DIR / "adapter_config.json").exists():
        raise RuntimeError(f"адаптер не найден в {ADAPTER_DIR}: сначала запустите llm/finetune.py")
    base = os.environ.get("SABYR_BASE_MODEL") or json.loads((ADAPTER_DIR / "adapter_config.json").read_text())["base_model_name_or_path"]
    gpu = torch.cuda.is_available()
    tokenizer = AutoTokenizer.from_pretrained(ADAPTER_DIR)
    model = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.bfloat16 if gpu else torch.float32)
    model = PeftModel.from_pretrained(model, ADAPTER_DIR).merge_and_unload()
    model.to("cuda" if gpu else "cpu").eval()
    state.update(tokenizer=tokenizer, model=model, base=base)


@app.on_event("startup")
def _startup() -> None:
    load()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = "sabyr-assistant"
    messages: list[Message]
    max_tokens: int = 200
    temperature: float = 0.3


@app.get("/health")
def health() -> dict:
    return {"status": "ok" if state else "loading", "base_model": state.get("base"), "adapter": str(ADAPTER_DIR)}


@app.post("/v1/chat/completions")
def chat(req: ChatRequest) -> dict:
    if not state:
        raise HTTPException(503, "модель ещё загружается")
    tokenizer, model = state["tokenizer"], state["model"]
    prompt = tokenizer.apply_chat_template([m.model_dump() for m in req.messages], tokenize=False,
                                           add_generation_prompt=True)
    ids = tokenizer(prompt, add_special_tokens=False, return_tensors="pt")["input_ids"].to(model.device)
    with torch.no_grad():
        out = model.generate(ids, max_new_tokens=req.max_tokens, do_sample=req.temperature > 0,
                             temperature=max(req.temperature, 1e-5), top_p=0.9, repetition_penalty=1.1,
                             pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id)
    text = tokenizer.decode(out[0][ids.shape[1]:], skip_special_tokens=True).strip()
    return {"id": f"sabyr-{int(time.time() * 1000)}", "object": "chat.completion", "model": req.model,
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": int(ids.shape[1]), "completion_tokens": int(out.shape[1] - ids.shape[1])}}
