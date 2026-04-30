#!/usr/bin/env python3

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from snac import SNAC
import soundfile as sf
import numpy as np
import json
import os
import sys
import argparse

CODE_START_TOKEN_ID = 128257
CODE_END_TOKEN_ID = 128258
CODE_TOKEN_OFFSET = 128266
SNAC_MIN_ID = 128266
SNAC_MAX_ID = 156937
SNAC_TOKENS_PER_FRAME = 7

SOH_ID = 128259
EOH_ID = 128260
SOA_ID = 128261
BOS_ID = 128000
TEXT_EOT_ID = 128009

class I18n:
    def __init__(self, lang='en'):
        self.lang = lang
        self.translations = {}
        try:
            base_path = os.path.dirname(__file__)
            with open(os.path.join(base_path, 'translations.json'), 'r', encoding='utf-8') as f:
                self.translations = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load translations: {e}")

    def t(self, key, **kwargs):
        lang_data = self.translations.get(self.lang, self.translations.get('en', {}))
        text = lang_data.get(key, key)
        return text.format(**kwargs)

def build_prompt(tokenizer, description: str, text: str) -> str:
    """Build formatted prompt for Maya1."""
    soh_token = tokenizer.decode([SOH_ID])
    eoh_token = tokenizer.decode([EOH_ID])
    soa_token = tokenizer.decode([SOA_ID])
    sos_token = tokenizer.decode([CODE_START_TOKEN_ID])
    eot_token = tokenizer.decode([TEXT_EOT_ID])
    bos_token = tokenizer.bos_token
    
    formatted_text = f'<description="{description}"> {text}'
    
    prompt = (
        soh_token + bos_token + formatted_text + eot_token +
        eoh_token + soa_token + sos_token
    )
    
    return prompt


def extract_snac_codes(token_ids: list) -> list:
    """Extract SNAC codes from generated tokens."""
    try:
        eos_idx = token_ids.index(CODE_END_TOKEN_ID)
    except ValueError:
        eos_idx = len(token_ids)
    
    snac_codes = [
        token_id for token_id in token_ids[:eos_idx]
        if SNAC_MIN_ID <= token_id <= SNAC_MAX_ID
    ]
    
    return snac_codes


def unpack_snac_from_7(snac_tokens: list) -> list:
    """Unpack 7-token SNAC frames to 3 hierarchical levels."""
    if snac_tokens and snac_tokens[-1] == CODE_END_TOKEN_ID:
        snac_tokens = snac_tokens[:-1]
    
    frames = len(snac_tokens) // SNAC_TOKENS_PER_FRAME
    snac_tokens = snac_tokens[:frames * SNAC_TOKENS_PER_FRAME]
    
    if frames == 0:
        return [[], [], []]
    
    l1, l2, l3 = [], [], []
    
    for i in range(frames):
        slots = snac_tokens[i*7:(i+1)*7]
        l1.append((slots[0] - CODE_TOKEN_OFFSET) % 4096)
        l2.extend([
            (slots[1] - CODE_TOKEN_OFFSET) % 4096,
            (slots[4] - CODE_TOKEN_OFFSET) % 4096,
        ])
        l3.extend([
            (slots[2] - CODE_TOKEN_OFFSET) % 4096,
            (slots[3] - CODE_TOKEN_OFFSET) % 4096,
            (slots[5] - CODE_TOKEN_OFFSET) % 4096,
            (slots[6] - CODE_TOKEN_OFFSET) % 4096,
        ])
    
    return [l1, l2, l3]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", default="en", choices=["en", "es", "fr", "de", "zh", "ja"])
    args = parser.parse_args()
    
    i18n = I18n(args.lang)
    
    # Load the best open source voice AI model
    print("\n" + i18n.t("loading_model"))
    model = AutoModelForCausalLM.from_pretrained(
        "maya-research/maya1", 
        torch_dtype=torch.bfloat16, 
        device_map="auto",
        trust_remote_code=True
    )
    tokenizer = AutoTokenizer.from_pretrained(
        "maya-research/maya1",
        trust_remote_code=True
    )
    print(i18n.t("model_loaded", count=len(tokenizer)))
    
    # Load SNAC audio decoder (24kHz)
    print("\n" + i18n.t("loading_decoder"))
    snac_model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval()
    if torch.cuda.is_available():
        snac_model = snac_model.to("cuda")
    print(i18n.t("decoder_loaded"))
    
    # Design your voice with natural language
    description = "Realistic male voice in the 30s age with american accent. Normal pitch, warm timbre, very good narrative voice."
    text = "Great First Time With Psychedelics. Was bored on a Sunday where I typically just don’t do anything, so I decided to try the 2C-B pill I bought from a friend. It would mark my first time using a proper psychedelic substance, up until this point I had only tried alcohol, cannabis and ketamine. I had a bad first experience with ketamine previously and threw up on it so I was apprehensive, but I read about 2C-B and its effects, how it would only last about 4 or so hours, how it’s a good beginner psychedelic so I thought I’d try it. I woke up at 10am and I split the pill somewhat unevenly and took the smaller piece at 11:00 on the dot and opened this document to try and articulate what I experienced."
    
    print("\n" + i18n.t("generating_speech"))
    print(i18n.t("description_label", desc=description))
    print(i18n.t("text_label", text=text))
    
    # Create prompt with proper formatting
    prompt = build_prompt(tokenizer, description, text)
    
    # Debug: Show prompt details
    print(f"\n" + i18n.t("prompt_preview"))
    print(f"   {repr(prompt[:200])}")
    print(i18n.t("prompt_length", count=len(prompt)))
    
    # Generate emotional speech
    inputs = tokenizer(prompt, return_tensors="pt")
    print(i18n.t("input_tokens", count=inputs['input_ids'].shape[1]))
    if torch.cuda.is_available():
        inputs = {k: v.to("cuda") for k, v in inputs.items()}
    
    with torch.inference_mode():
        outputs = model.generate(
            **inputs, 
            max_new_tokens=2048,  # Increase to let model finish naturally
            min_new_tokens=28,  # At least 4 SNAC frames
            temperature=0.4, 
            top_p=0.9, 
            repetition_penalty=1.1,  # Prevent loops
            do_sample=True,
            eos_token_id=CODE_END_TOKEN_ID,  # Stop at end of speech token
            pad_token_id=tokenizer.pad_token_id,
        )
    
    # Extract generated tokens (everything after the input prompt)
    generated_ids = outputs[0, inputs['input_ids'].shape[1]:].tolist()
    
    print(i18n.t("generated_tokens", count=len(generated_ids)))
    
    # Debug: Check what tokens we got
    print(i18n.t("first_20", tokens=str(generated_ids[:20])))
    print(i18n.t("last_20", tokens=str(generated_ids[-20:])))
    
    # Check if EOS was generated
    if CODE_END_TOKEN_ID in generated_ids:
        eos_position = generated_ids.index(CODE_END_TOKEN_ID)
        print(i18n.t("eos_found", pos=eos_position, total=len(generated_ids)))
    
    # Extract SNAC audio tokens
    snac_tokens = extract_snac_codes(generated_ids)
    
    print(i18n.t("extracted_snac", count=len(snac_tokens)))
    
    # Debug: Analyze token types
    snac_count = sum(1 for t in generated_ids if SNAC_MIN_ID <= t <= SNAC_MAX_ID)
    other_count = sum(1 for t in generated_ids if t < SNAC_MIN_ID or t > SNAC_MAX_ID)
    print(i18n.t("snac_in_output", count=snac_count))
    print(i18n.t("other_in_output", count=other_count))
    
    # Check for SOS token
    if CODE_START_TOKEN_ID in generated_ids:
        sos_pos = generated_ids.index(CODE_START_TOKEN_ID)
        print(i18n.t("sos_pos", pos=sos_pos))
    else:
        print(i18n.t("no_sos"))
    
    if len(snac_tokens) < 7:
        print(i18n.t("error_not_enough"))
        return
    
    # Unpack SNAC tokens to 3 hierarchical levels
    levels = unpack_snac_from_7(snac_tokens)
    frames = len(levels[0])
    
    print(i18n.t("unpacked_frames", count=frames))
    print(i18n.t("l1_codes", count=len(levels[0])))
    print(i18n.t("l2_codes", count=len(levels[1])))
    print(i18n.t("l3_codes", count=len(levels[2])))
    
    # Convert to tensors
    device = "cuda" if torch.cuda.is_available() else "cpu"
    codes_tensor = [
        torch.tensor(level, dtype=torch.long, device=device).unsqueeze(0)
        for level in levels
    ]
    
    # Generate final audio with SNAC decoder
    print("\n" + i18n.t("decoding_audio"))
    with torch.inference_mode():
        z_q = snac_model.quantizer.from_codes(codes_tensor)
        audio = snac_model.decoder(z_q)[0, 0].cpu().numpy()
    
    # Trim warmup samples (first 2048 samples)
    if len(audio) > 2048:
        audio = audio[2048:]
    
    duration_sec = len(audio) / 24000
    print(i18n.t("audio_generated", samples=len(audio), seconds=duration_sec))
    
    # Save your emotional voice output
    output_file = "output.wav"
    sf.write(output_file, audio, 24000)
    print("\n" + i18n.t("success"))


if __name__ == "__main__":
    main()
