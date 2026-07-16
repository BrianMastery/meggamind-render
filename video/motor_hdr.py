#!/usr/bin/env python3
"""INGESTA HDR del motor de color — el motor recibe el HLG crudo y hace ÉL la conversión
a SDR con matemática profesional (nada de tonemap=hable):

  HLG 10bit (bt2020nc/arib-std-b67)
    -> zscale linealiza con OOTF a luz de display (npl=1000 nits)
    -> normalización a blanco de referencia SDR (BT.2408: 203 nits = blanco difuso)
    -> EETF BT.2390 (rodilla Hermite): las altas ruedan orgánico, NUNCA clipean ni lavan
    -> gamut mapping BT.2020 -> BT.709 (matriz + compresión de croma hacia luma, sin neón)
    -> salida lineal 709 lista para el grade del motor V3 (to_display 2.4 al final)

Referencias: ITU-R BT.2390-10 §5.4 (EETF), BT.2408 (blanco 203 nits), BT.2087 (matriz).
"""
import numpy as np
import subprocess

FF = "/tmp/ffbin/ffmpeg"

# BT.2020 -> BT.709 (lineal), BT.2087
M_2020_709 = np.array([
    [ 1.6605, -0.5876, -0.0728],
    [-0.1246,  1.1329, -0.0083],
    [-0.0182, -0.1006,  1.1187]], np.float32)

LUMA_709 = np.array([0.2126, 0.7152, 0.0722], np.float32)

# Blanco de referencia HLG (BT.2408): 203 nits sobre pico 1000 -> escala a 1.0 = blanco SDR
REF_WHITE_NITS = 203.0
PEAK_NITS = 1000.0


def leer_frame_hlg_lineal(video: str, t: float, w: int = 3840):
    """Decodifica UN frame HLG -> lineal de display (float32, 1.0 = npl 1000 nits), primarios 2020."""
    h = int(w * 9 / 16)
    r = subprocess.run(
        [FF, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", video,
         "-vframes", "1",
         "-vf", f"zscale=w={w}:h={h}:f=spline36,zscale=tin=arib-std-b67:t=linear:npl={int(PEAK_NITS)}",
         "-pix_fmt", "gbrpf32le", "-f", "rawvideo", "-"],
        capture_output=True)
    buf = np.frombuffer(r.stdout, np.float32)
    g, b, rr = buf.reshape(3, h, w)          # gbrp = planos G,B,R
    return np.stack([rr, g, b], axis=-1)      # -> RGB, primarios 2020, lineal display


def eetf_bt2390(lin_rel: np.ndarray, l_max_rel: float) -> np.ndarray:
    """EETF BT.2390 sobre luminancia relativa (1.0 = blanco SDR): rodilla Hermite que
    comprime [ks..l_max] en [ks..1.0]. Trabaja en dominio raíz (perceptual aprox) para
    una rodilla suave sin recomputar PQ completo (estable y monótona)."""
    # dominio perceptual simple: L' = L^(1/2.4) normalizado al máximo
    p = 1.0 / 2.4
    e = np.power(np.clip(lin_rel, 0.0, l_max_rel) / l_max_rel, p)   # 0..1
    e_max = 1.0
    e_sdr = np.power(1.0 / l_max_rel, p)      # dónde cae el blanco SDR en el dominio
    ks = 1.5 * e_sdr - 0.5                     # rodilla BT.2390: arranca al 50% bajo el blanco
    def hermite(x):
        tt = (x - ks) / (e_max - ks)
        return ((2 * tt**3 - 3 * tt**2 + 1) * ks
                + (tt**3 - 2 * tt**2 + tt) * (e_max - ks)
                + (-2 * tt**3 + 3 * tt**2) * e_sdr)
    out = np.where(e > ks, hermite(e), e)
    # de vuelta a lineal, re-normalizado a 1.0 = blanco SDR
    return np.power(np.clip(out / e_sdr, 0.0, None), 2.4)


def hlg_a_sdr709_lineal(lin_display_2020: np.ndarray) -> np.ndarray:
    """Lineal display 2020 (1.0=1000 nits) -> lineal 709 (1.0 = blanco SDR), listo para el grade."""
    # 1) normalizar: 1.0 = blanco de referencia (203 nits)
    lin = lin_display_2020 * np.float32(PEAK_NITS / REF_WHITE_NITS)
    l_max = np.float32(PEAK_NITS / REF_WHITE_NITS)   # 4.926 = headroom HDR sobre el blanco
    # 2) EETF por luminancia (preserva ratios de color: nada de desaturar por canal)
    Y = np.maximum(lin @ np.array([0.2627, 0.6780, 0.0593], np.float32), 1e-6)  # luma 2020
    Y2 = eetf_bt2390(Y, float(l_max))
    lin = lin * (Y2 / Y)[..., None]
    # 3) gamut 2020 -> 709
    lin709 = lin @ M_2020_709.T
    # 4) fuera-de-gamut: comprimir croma hacia luma SOLO donde hay negativos (sin tocar el resto)
    Yl = np.maximum(lin709 @ LUMA_709, 1e-6)[..., None]
    mn = lin709.min(axis=-1, keepdims=True)
    # factor que lleva el canal más negativo justo a 0 (desat mínimo local)
    f = np.where(mn < 0.0, Yl / np.maximum(Yl - mn, 1e-6), 1.0)
    lin709 = Yl + (lin709 - Yl) * f
    # 5) por encima de 1.0 puede quedar un pelo de las altas: rodilla ya lo dejó ~1.0; clip suave
    return np.clip(lin709, 0.0, 1.08)


def frame_sdr(video: str, t: float, w: int = 3840) -> np.ndarray:
    """Atajo: frame HLG -> uint16 display SDR 709 (gamma 2.4), SIN grade (la base limpia)."""
    lin = hlg_a_sdr709_lineal(leer_frame_hlg_lineal(video, t, w))
    disp = np.power(np.clip(lin, 0.0, 1.0), 1.0 / 2.4)
    return (disp * 65535.0 + 0.5).astype(np.uint16)
