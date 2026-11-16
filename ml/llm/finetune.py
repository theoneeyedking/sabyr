"""Дообучение небольшой открытой модели через LoRA на диалогах Sabyr.

    python -m llm.finetune --base Qwen/Qwen2.5-1.5B-Instruct --data llm/data --out llm/out/sabyr-assistant

Функция потерь считается только по репликам ассистента (системный промпт и реплики клиента замаскированы).
Режим --smoke проверяет весь пайплайн без скачивания весов: крошечная случайная модель и токенизатор,
обученный на самом датасете. Он проверяет код, а не качество.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SMOKE_TEMPLATE = (
    "{% for m in messages %}<|{{ m['role'] }}|>\n{{ m['content'] }}<|end|>\n{% endfor %}"
    "{% if add_generation_prompt %}<|assistant|>\n{% endif %}")


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def assistant_spans(tokenizer, messages: list[dict]) -> tuple[str, list[tuple[int, int]]]:
    """Текст диалога по chat-шаблону модели и символьные границы реплик ассистента (включая маркер конца)."""
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    spans = []
    for i, m in enumerate(messages):
        if m["role"] != "assistant":
            continue
        prefix = tokenizer.apply_chat_template(messages[:i], tokenize=False, add_generation_prompt=True)
        upto = tokenizer.apply_chat_template(messages[:i + 1], tokenize=False, add_generation_prompt=False)
        if not (text.startswith(prefix) and text.startswith(upto)):
            raise ValueError("chat-шаблон модели не префиксный: маскирование по границам реплик невозможно")
        spans.append((len(prefix), len(upto)))
    return text, spans


def encode_dialog(tokenizer, messages: list[dict], max_len: int) -> dict:
    """Токенизирует диалог и маскирует (-100) всё, кроме реплик ассистента."""
    text, spans = assistant_spans(tokenizer, messages)
    enc = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    labels = [tok if any(lo <= start < hi for lo, hi in spans) else -100
              for tok, (start, _end) in zip(enc["input_ids"], enc["offset_mapping"])]
    input_ids, labels = enc["input_ids"][:max_len], labels[:max_len]
    return {"input_ids": input_ids, "labels": labels, "attention_mask": [1] * len(input_ids)}


def build_smoke_model(texts: list[str], workdir: Path):
    """Крошечная GPT-2 со случайными весами и BPE-токенизатор, обученный локально."""
    from tokenizers import Tokenizer, models, pre_tokenizers, trainers
    from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast

    tok = Tokenizer(models.BPE(unk_token="<unk>"))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    specials = ["<unk>", "<pad>", "<|system|>", "<|user|>", "<|assistant|>", "<|end|>"]
    tok.train_from_iterator(texts, trainers.BpeTrainer(vocab_size=2000, special_tokens=specials))
    tokenizer = PreTrainedTokenizerFast(tokenizer_object=tok, unk_token="<unk>", pad_token="<pad>", eos_token="<|end|>")
    tokenizer.chat_template = SMOKE_TEMPLATE
    model = GPT2LMHeadModel(GPT2Config(vocab_size=len(tokenizer), bos_token_id=tokenizer.eos_token_id, n_positions=1024, n_embd=64, n_layer=2, n_head=2,
                                       pad_token_id=tokenizer.pad_token_id, eos_token_id=tokenizer.eos_token_id))
    base = workdir / "smoke-base"
    model.save_pretrained(base)
    tokenizer.save_pretrained(base)
    return str(base)


def main() -> None:
    ap = argparse.ArgumentParser(description="LoRA-дообучение ассистента Sabyr")
    ap.add_argument("--base", default="Qwen/Qwen2.5-1.5B-Instruct", help="базовая модель (Hugging Face)")
    ap.add_argument("--data", type=Path, default=HERE / "data")
    ap.add_argument("--out", type=Path, default=HERE / "out" / "sabyr-assistant")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--grad-accum", type=int, default=2)
    ap.add_argument("--max-len", type=int, default=1024)
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--lora-alpha", type=int, default=32)
    ap.add_argument("--lora-dropout", type=float, default=0.05)
    ap.add_argument("--smoke", action="store_true", help="проверка пайплайна на крошечной случайной модели, CPU")
    args = ap.parse_args()

    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import (AutoModelForCausalLM, AutoTokenizer, DataCollatorForSeq2Seq, Trainer,
                              TrainingArguments)

    train, val = load_jsonl(args.data / "train.jsonl"), load_jsonl(args.data / "val.jsonl")
    args.out.mkdir(parents=True, exist_ok=True)
    if args.smoke:
        train, val = train[:48], val[:8]
        args.base = build_smoke_model([m["content"] for d in train for m in d["messages"]], args.out)
        args.epochs, args.batch, args.grad_accum = 1.0, 8, 1

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    use_gpu = torch.cuda.is_available()
    model = AutoModelForCausalLM.from_pretrained(args.base, torch_dtype=torch.bfloat16 if use_gpu else torch.float32)
    lora = LoraConfig(r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, bias="none",
                      task_type="CAUSAL_LM",
                      target_modules=["c_attn"] if args.smoke else ["q_proj", "k_proj", "v_proj", "o_proj"])
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    class Dialogs(torch.utils.data.Dataset):
        def __init__(self, rows):
            self.rows = [encode_dialog(tokenizer, r["messages"], args.max_len) for r in rows]

        def __len__(self):
            return len(self.rows)

        def __getitem__(self, i):
            return self.rows[i]

    train_ds, val_ds = Dialogs(train), Dialogs(val)
    supervised = sum(sum(t != -100 for t in r["labels"]) for r in train_ds.rows)
    total = sum(len(r["labels"]) for r in train_ds.rows)
    print(f"диалогов: {len(train_ds)} / {len(val_ds)}; токенов {total}, из них обучающих (реплики ассистента) {supervised}")

    total_steps = max(1, int(len(train_ds) / (args.batch * args.grad_accum) * args.epochs))
    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(args.out / "checkpoints"), num_train_epochs=args.epochs, learning_rate=args.lr,
            per_device_train_batch_size=args.batch, per_device_eval_batch_size=args.batch,
            gradient_accumulation_steps=args.grad_accum, lr_scheduler_type="cosine", warmup_steps=max(1, total_steps // 20),
            logging_steps=5 if args.smoke else 20, eval_strategy="epoch", save_strategy="no",
            bf16=use_gpu, report_to=[], seed=7, use_cpu=not use_gpu),
        train_dataset=train_ds, eval_dataset=val_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
    )
    before = trainer.evaluate()["eval_loss"]
    trainer.train()
    after = trainer.evaluate()["eval_loss"]
    model.save_pretrained(args.out)
    tokenizer.save_pretrained(args.out)
    report = {"base_model": args.base, "smoke": args.smoke, "train_dialogs": len(train_ds), "val_dialogs": len(val_ds),
              "eval_loss_before": round(before, 4), "eval_loss_after": round(after, 4),
              "lora": {"r": args.lora_r, "alpha": args.lora_alpha, "dropout": args.lora_dropout},
              "epochs": args.epochs, "lr": args.lr}
    (args.out / "training_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
