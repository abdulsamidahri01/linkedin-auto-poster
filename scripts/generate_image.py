#!/usr/bin/env python3
"""
LinkedIn Auto Poster - Scientific Image Generator
Generates branded matplotlib figures for each content pillar.

Usage:
    python3 scripts/generate_image.py --pillar "AI + MICROBIOLOGY" --topic "..." --output /tmp/post_image.png

GCU Brand: Navy #003366, Gold #D4AF37, Teal #1D9E75, Coral #D85A30
"""

import argparse
import hashlib
import json
import sys
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

NAVY  = "#003366"
GOLD  = "#D4AF37"
TEAL  = "#1D9E75"
CORAL = "#D85A30"
WHITE = "#FFFFFF"
GRAY  = "#888780"
PURPLE = "#7F77DD"
RED   = "#E24B4A"
LIGHT = "#F4F6F9"

def topic_seed(topic):
    return int(hashlib.md5(topic.encode()).hexdigest()[:8], 16) % 100000

def gen_ai_microbiology(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    methods = ['Blood\nculture', 'MALDI-\nTOF', 'PCR\npanel', 'Metagenomic\nNGS', 'AI +\npoint-of-care']
    base_times = [48, 6, 4, 14, 1.5]
    times = [max(0.5, t + np.random.uniform(-0.5, 0.5)) for t in base_times]
    colors = [CORAL, CORAL, GRAY, GRAY, TEAL]
    bars = ax.bar(range(len(methods)), times, color=colors, alpha=0.85, width=0.55, edgecolor=NAVY, linewidth=0.5)
    for i, v in enumerate(times):
        ax.text(i, v + 1, f'{v:.1f}h', ha='center', color=WHITE, fontsize=11, fontweight='bold')
    ax.axhline(y=2, color=TEAL, linewidth=1, linestyle='--', alpha=0.5)
    ax.text(4.4, 2.5, 'AI target', color=TEAL, fontsize=8, alpha=0.7)
    ax.set_xticks(range(len(methods)))
    ax.set_xticklabels(methods, color=WHITE, fontsize=9)
    ax.set_ylabel('Time to result (hours)', color=WHITE, fontsize=10)
    ax.set_title('Diagnostic Speed: From Sample to Decision', color=GOLD, fontsize=14, fontweight='bold', pad=14)
    ax.tick_params(colors=WHITE, labelsize=9)
    ax.set_ylim(0, 56)
    _style_axes(ax)
    _add_footer(fig, 'Cultures confirm the past. AI predicts what comes next.')
    return fig

def gen_clinical_blind_spots(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    steps = ['Sample\ncollected', 'Transport\nto lab', 'Culture\nincubation', 'ID &\nsensitivity', 'Result to\nclinician', 'Treatment\ndecision']
    hours = [0, 2, 4, 20, 24, 28]
    durations = [2, 2, 16, 4, 4, 4]
    colors = [TEAL, GRAY, CORAL, CORAL, GRAY, TEAL]
    ax.barh(range(len(steps)), durations, left=hours, color=colors, alpha=0.85, height=0.5, edgecolor=NAVY, linewidth=0.5)
    for i, (h, d) in enumerate(zip(hours, durations)):
        ax.text(h + d + 0.5, i, f'{h+d}h', va='center', color=WHITE, fontsize=9.5, fontweight='bold')
    ax.annotate('AI: ~2h total', xy=(2, 5.5), xytext=(18, 5.5), color=TEAL, fontsize=9, fontweight='bold', arrowprops=dict(arrowstyle='<-', color=TEAL, lw=1.3))
    ax.set_yticks(range(len(steps)))
    ax.set_yticklabels(steps, color=WHITE, fontsize=9.5)
    ax.set_xlabel('Hours elapsed', color=WHITE, fontsize=10)
    ax.set_title('The 28-Hour Diagnostic Delay', color=GOLD, fontsize=14, fontweight='bold', pad=14)
    ax.tick_params(colors=WHITE, labelsize=9)
    ax.set_xlim(0, 36)
    _style_axes(ax)
    _add_footer(fig, 'The bottleneck was never the algorithm. It was the workflow around it.')
    return fig

def gen_microbial_intelligence(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    x = np.linspace(0, 10, 400)
    population = 1 / (1 + np.exp(-1.2 * (x - 5)))
    autoinducer = 0.95 / (1 + np.exp(-1.4 * (x - 5.2)))
    ax.plot(x, population, color=GOLD, linewidth=2.5, label='Population density')
    ax.plot(x, autoinducer, color=TEAL, linewidth=2.5, linestyle='--', label='[Autoinducer]')
    threshold = 0.55
    ax.axhline(y=threshold, color=CORAL, linewidth=1.5, linestyle=':', label='Quorum threshold')
    ax.text(10.15, threshold, 'Quorum\nthreshold', color=CORAL, fontsize=8.5, va='center', fontweight='bold')
    ax.axvspan(0, 4.2, alpha=0.07, color=GRAY)
    ax.axvspan(4.2, 5.8, alpha=0.12, color=GOLD)
    ax.axvspan(5.8, 10, alpha=0.09, color=TEAL)
    for xp, label, col in [(2.1, 'Below quorum\n(silent)', GRAY), (5.0, 'Threshold\ncrossing', GOLD), (7.9, 'Above quorum\n(collective)', TEAL)]:
        ax.text(xp, 0.97, label, color=col, fontsize=8.5, ha='center', va='top', fontweight='bold', transform=ax.get_xaxis_transform())
    cross_x = x[np.argmin(np.abs(autoinducer - threshold))]
    ax.annotate('Gene expression\nswitches ON', xy=(cross_x, threshold), xytext=(cross_x - 1.4, threshold + 0.22), color=CORAL, fontsize=8.5, fontweight='bold', arrowprops=dict(arrowstyle='->', color=CORAL, lw=1.3, connectionstyle='arc3,rad=-0.2'))
    ax.legend(loc='upper left', framealpha=0.15, edgecolor=GOLD, labelcolor=WHITE, fontsize=9)
    ax.set_xlabel('Bacterial population density  ->', color=WHITE, fontsize=10)
    ax.set_ylabel('Relative concentration', color=WHITE, fontsize=10)
    ax.set_title('Quorum Sensing: The Collective Decision Threshold', color=GOLD, fontsize=14, fontweight='bold', pad=14)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 1.05)
    ax.set_xticks([])
    ax.tick_params(colors=WHITE, labelsize=9)
    _style_axes(ax)
    _add_footer(fig, 'The collective computed something that no individual could.')
    return fig

def gen_academic_research(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    stages = ['Experiments\ndesigned', 'Executed\nsuccessfully', 'Yielded\nusable data', 'Survived\npeer review', 'Published']
    counts = [100, 72, 38, 18, 12]
    colors = [GRAY, GRAY, CORAL, CORAL, TEAL]
    bars = ax.barh(range(len(stages)), counts, color=colors, alpha=0.85, height=0.5, edgecolor=NAVY)
    for i, v in enumerate(counts):
        ax.text(v + 1.5, i, f'{v}%', va='center', color=WHITE, fontsize=11, fontweight='bold')
    ax.set_yticks(range(len(stages)))
    ax.set_yticklabels(stages, color=WHITE, fontsize=10)
    ax.set_xlabel('Percentage of initial experiments', color=WHITE, fontsize=10)
    ax.set_title('The Research Funnel Nobody Publishes', color=GOLD, fontsize=14, fontweight='bold', pad=14)
    ax.set_xlim(0, 115)
    ax.tick_params(colors=WHITE, labelsize=9)
    _style_axes(ax)
    _add_footer(fig, 'The gap between what the paper claims and what the lab experienced.')
    return fig

def gen_future_healthcare(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    years = [2015, 2018, 2020, 2022, 2024, 2026, 2028, 2030]
    central = [95, 90, 85, 78, 72, 65, 55, 40]
    decentral = [5, 10, 15, 22, 28, 35, 45, 60]
    ax.fill_between(years, central, alpha=0.3, color=CORAL)
    ax.fill_between(years, decentral, alpha=0.3, color=TEAL)
    ax.plot(years, central, color=CORAL, linewidth=2.5, marker='o', markersize=5, label='Central lab reliance')
    ax.plot(years, decentral, color=TEAL, linewidth=2.5, marker='s', markersize=5, label='Point-of-care adoption')
    ax.annotate('Projected crossover\n~2029', xy=(2029, 50), xytext=(2022, 55), color=GOLD, fontsize=9, fontweight='bold', arrowprops=dict(arrowstyle='->', color=GOLD, lw=1.3))
    ax.axvline(x=2026, color=GOLD, linewidth=1, linestyle='--', alpha=0.5)
    ax.text(2026.2, 92, 'Today', color=GOLD, fontsize=8.5)
    ax.legend(loc='center left', framealpha=0.15, edgecolor=GOLD, labelcolor=WHITE, fontsize=9)
    ax.set_xlabel('Year', color=WHITE, fontsize=10)
    ax.set_ylabel('Share of diagnostic volume (%)', color=WHITE, fontsize=10)
    ax.set_title('The Diagnostic Shift: Central Labs vs Point-of-Care', color=GOLD, fontsize=14, fontweight='bold', pad=14)
    ax.set_ylim(0, 100)
    ax.tick_params(colors=WHITE, labelsize=9)
    _style_axes(ax)
    _add_footer(fig, 'The economic model of healthcare is incompatible with predictive medicine.')
    return fig

def gen_public_health_amr(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    genes = ['blaKPC', 'mcr-1', 'NDM-1', 'OXA-48', 'VIM', 'IMP']
    sources = ['Clinical\nisolates', 'Wastewater', 'Agriculture', 'Environment']
    data = np.array([[72, 58, 41, 19], [18, 44, 67, 38], [55, 31, 22, 12], [63, 27, 18, 9], [41, 52, 33, 24], [29, 38, 45, 31]])
    noise = np.random.randint(-3, 4, data.shape)
    data = np.clip(data + noise, 1, 95)
    im = ax.imshow(data, cmap='YlOrRd', aspect='auto', vmin=0, vmax=80, interpolation='nearest')
    for i in range(len(genes)):
        for j in range(len(sources)):
            val = data[i, j]
            color = WHITE if val > 45 else GRAY
            ax.text(j, i, f'{val}%', ha='center', va='center', fontsize=10, color=color, fontweight='bold')
    cbar = plt.colorbar(im, ax=ax, shrink=0.8, pad=0.02)
    cbar.ax.yaxis.set_tick_params(color=WHITE, labelsize=8)
    cbar.outline.set_edgecolor(GOLD)
    cbar.outline.set_alpha(0.4)
    plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color=WHITE)
    cbar.set_label('Prevalence (%)', color=WHITE, fontsize=9)
    ax.set_xticks(range(len(sources)))
    ax.set_xticklabels(sources, color=WHITE, fontsize=9.5)
    ax.set_yticks(range(len(genes)))
    ax.set_yticklabels(genes, color=GOLD, fontsize=10, fontweight='bold', fontstyle='italic')
    ax.set_title('AMR Gene Distribution by Source (2024-25 Surveillance)', color=GOLD, fontsize=13, fontweight='bold', pad=14)
    _style_axes(ax)
    _add_footer(fig, 'Pathogens do not respect fiscal years.')
    return fig

def gen_philosophical_science(topic, seed):
    np.random.seed(seed)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor(NAVY)
    ax.set_facecolor(NAVY)
    categories = ['Diagnosis\ncertainty', 'Treatment\nresponse', 'Resistance\nprediction', 'Outbreak\nforecasting', 'Long-term\nAMR trends']
    known = [75, 45, 30, 20, 10]
    uncertain = [25, 55, 70, 80, 90]
    y_pos = range(len(categories))
    ax.barh(y_pos, known, color=TEAL, alpha=0.85, height=0.4, label='What we know', edgecolor=NAVY)
    ax.barh(y_pos, uncertain, left=known, color=CORAL, alpha=0.5, height=0.4, label="What we don't", edgecolor=NAVY)
    for i, (k, u) in enumerate(zip(known, uncertain)):
        ax.text(k/2, i, f'{k}%', ha='center', va='center', color=WHITE, fontsize=9, fontweight='bold')
        ax.text(k + u/2, i, f'{u}%', ha='center', va='center', color=WHITE, fontsize=9, fontweight='bold')
    ax.set_yticks(y_pos)
    ax.set_yticklabels(categories, color=WHITE, fontsize=9.5)
    ax.set_xlabel('Percentage', color=WHITE, fontsize=10)
    ax.set_title('The Uncertainty Spectrum in Clinical Microbiology', color=GOLD, fontsize=14, fontweight='bold', pad=14)
    ax.legend(loc='lower right', framealpha=0.15, edgecolor=GOLD, labelcolor=WHITE, fontsize=9)
    ax.set_xlim(0, 100)
    ax.tick_params(colors=WHITE, labelsize=9)
    _style_axes(ax)
    _add_footer(fig, 'Science as a living, imperfect process.')
    return fig

def _style_axes(ax):
    for spine in ax.spines.values():
        spine.set_edgecolor(GOLD)
        spine.set_alpha(0.35)

def _add_footer(fig, quote):
    fig.text(0.5, 0.01, f'"{quote}"', ha='center', color=GOLD, fontsize=9, style='italic', alpha=0.85)

PILLAR_GENERATORS = {
    'AI + MICROBIOLOGY':                     gen_ai_microbiology,
    'CLINICAL BLIND SPOTS':                  gen_clinical_blind_spots,
    'MICROBIAL INTELLIGENCE':                gen_microbial_intelligence,
    'ACADEMIC / RESEARCH REALITY':           gen_academic_research,
    'FUTURE HEALTHCARE SYSTEMS':             gen_future_healthcare,
    'PUBLIC HEALTH + AMR':                   gen_public_health_amr,
    'REFLECTIVE / PHILOSOPHICAL SCIENCE':    gen_philosophical_science,
}

def generate(pillar, topic, output_path):
    gen_fn = PILLAR_GENERATORS.get(pillar, gen_ai_microbiology)
    seed = topic_seed(topic)
    fig = gen_fn(topic, seed)
    plt.tight_layout(rect=[0, 0.04, 1, 1])
    fig.savefig(output_path, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor(), pad_inches=0.15)
    plt.close(fig)
    size_kb = os.path.getsize(output_path) / 1024
    print(json.dumps({"status": "ok", "path": output_path, "size_kb": round(size_kb, 1), "pillar": pillar}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pillar', required=True)
    parser.add_argument('--topic', required=True)
    parser.add_argument('--output', default='/tmp/linkedin_post_image.png')
    args = parser.parse_args()
    generate(args.pillar, args.topic, args.output)
