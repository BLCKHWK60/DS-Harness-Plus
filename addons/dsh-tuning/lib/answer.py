"""Tuning Plus: answer exam requests with a local MLX model, with or without an adapter.

A fixed script shipped with the add-on; it is run with the trainer's Python and fixed arguments, never
written or changed by a model. It loads the model once, answers each request in the input file and writes
one JSON line per answer. It never downloads anything (the caller sets HF_HUB_OFFLINE) and never writes
into the model's folder.

Usage: python answer.py --model <folder> [--adapter <folder>] --input <file.jsonl> --output <file.jsonl> [--max-tokens N]
Each input line: {"id": "...", "messages": [{"role": "user", "content": "..."}]}
Each output line: {"id": "...", "text": "..."}
"""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--adapter", default=None)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-tokens", type=int, default=256)
    args = parser.parse_args()

    from mlx_lm import load, generate

    model, tokenizer = load(args.model, adapter_path=args.adapter or None)
    with open(args.input, "r", encoding="utf-8") as source, open(args.output, "w", encoding="utf-8") as out:
        for line in source:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except ValueError:
                continue
            messages = item.get("messages") or []
            try:
                if getattr(tokenizer, "chat_template", None):
                    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                else:
                    prompt = "\n\n".join(str(m.get("content", "")) for m in messages) + "\n\n"
                text = generate(model, tokenizer, prompt=prompt, max_tokens=max(1, min(args.max_tokens, 4096)))
            except Exception as error:  # one failed request does not stop the others
                text = ""
                sys.stderr.write("answer failed: %s\n" % (str(error)[:200],))
            out.write(json.dumps({"id": item.get("id"), "text": text}) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
