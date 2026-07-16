#!/usr/bin/env python3
"""Regenera hook_alpha (capa de persona con ALPHA del hook) desde la pieza COLOREADA
nueva, para que el recorte calce byte a byte con el fondo (misma ingesta BT.2390+textura).
Pipe: decode rgb24 -> DeepLabV3 (513px, clase persona) -> máscara dura+feather (curva del
hook aprobado) -> rgba -> libvpx-vp9 yuva420p.  Uso: reel_hook_alpha2.py <pieza.mp4> <out.webm>"""
import subprocess, sys
import torch
from PIL import Image, ImageFilter
from torchvision.models.segmentation import deeplabv3_resnet50, DeepLabV3_ResNet50_Weights

FF = "ffmpeg"
SRC, OUT = sys.argv[1], sys.argv[2]
W, H = 3840, 2160
SW, SH = 513, 289

modelo = deeplabv3_resnet50(weights=DeepLabV3_ResNet50_Weights.DEFAULT).eval()
media = torch.tensor([0.485, 0.456, 0.406])[:, None, None]
desv = torch.tensor([0.229, 0.224, 0.225])[:, None, None]

dec = subprocess.Popen([FF, "-nostdin", "-loglevel", "error", "-i", SRC,
                        "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
                       stdout=subprocess.PIPE, bufsize=W * H * 3)
enc = subprocess.Popen([FF, "-nostdin", "-loglevel", "error", "-y",
                        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", "60", "-i", "-",
                        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "34", "-b:v", "0",
                        "-row-mt", "1", "-speed", "6", "-an", OUT],
                       stdin=subprocess.PIPE)
n = 0
nbytes = W * H * 3
while True:
    buf = dec.stdout.read(nbytes)
    if len(buf) < nbytes:
        break
    frame = Image.frombytes("RGB", (W, H), buf)
    chico = frame.resize((SW, SH))
    t = torch.frombuffer(bytearray(chico.tobytes()), dtype=torch.uint8).reshape(SH, SW, 3)
    t = t.permute(2, 0, 1).float() / 255.0
    t = (t - media) / desv
    with torch.no_grad():
        out = modelo(t.unsqueeze(0))["out"][0]
    m = (out.argmax(0) == 15).mul(255).to(torch.uint8)
    mask = Image.frombytes("L", (SW, SH), bytes(m.flatten().tolist()))
    mask = mask.resize((W, H), Image.LANCZOS)
    mask = mask.point(lambda v: 0 if v < 110 else min(255, (v - 110) * 4))
    mask = mask.filter(ImageFilter.GaussianBlur(2.5))
    rgba = frame.copy()
    rgba.putalpha(mask)
    enc.stdin.write(rgba.tobytes())
    n += 1
    if n % 30 == 0:
        print(f"{n} frames", flush=True)
enc.stdin.close()
dec.wait(); enc.wait()
print(f"ALPHA_DONE {n} frames -> {OUT}", flush=True)
