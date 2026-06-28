# Prompt — Design a Modern AI Context Optimization Studio

Design a modern, polished, production-quality web application for an **AI Context Optimization Studio**. The application should feel comparable in quality to products like Cursor, Linear, Vercel, or Claude—not a dashboard full of widgets, but a focused productivity application with clean spacing, progressive disclosure, and an intuitive workflow.

The experience should prioritize simplicity for first-time users while exposing powerful controls for advanced users.

---

# Overall Layout

The application should be a **single-page interface** divided vertically into logical sections.

The overall workflow should naturally guide the user through:

1. Input
2. Optimization
3. Results
4. Metrics
5. Pipeline Explanation
6. Advanced Controls (optional)

The interface should avoid overwhelming users with too many controls upfront.

---

# Header

A clean header containing:

* Product name
* Small one-line description explaining that the tool optimizes prompts before sending them to LLMs
* GitHub button
* Documentation button
* Settings button

No oversized hero banners.

The header should feel lightweight.

---

# Input Section

The largest element on the page.

A large multi-line editor supporting:

* Plain text
* Code
* Logs
* Markdown
* JSON
* Chat history

Features:

* Syntax highlighting when applicable
* Line numbers (optional)
* Character count
* Token count (updates live)
* Word count
* Drag-and-drop support
* Paste support
* Upload file button

Supported uploads include:

* txt
* md
* json
* csv
* log
* pdf
* docx

Above or beside the editor:

Quick actions:

* Paste Clipboard
* Upload File
* Clear
* Load Sample

---

# Optimize Button

A single prominent action button.

Examples:

"Optimize Context"

or

"Compress Prompt"

The button should:

* Show loading animation
* Show current optimization stage while running
* Disable repeated clicks
* Display estimated remaining time if possible

---

# Live Progress View

While optimization is happening, display an animated pipeline.

Example:

Input Analysis

✓ Completed

↓

Document Classification

Running...

↓

Strategy Selection

Waiting

↓

Compression

Waiting

↓

Validation

Waiting

↓

Final Assembly

Waiting

Each stage updates live.

---

# Output Section

Appears after optimization.

Large editor similar to the input.

Features:

* Read-only
* Copy button
* Download button
* Expand fullscreen
* Word wrap toggle
* Show hidden whitespace (optional)

Above the output:

Display:

Original Tokens → Optimized Tokens

Example

152,438 → 7,921

---

# Optimization Report Card

A premium-looking information card.

Contains:

Original tokens

Compressed tokens

Compression ratio

Total tokens saved

Percentage reduction

Estimated cost before

Estimated cost after

Estimated savings

Estimated latency reduction

Compression time

Information retention score

Confidence score

Quality rating

Pipeline selected

---

# Model Pricing Selector

Inside the metrics card.

Dropdown containing popular models.

Examples:

GPT-5

GPT-5 Mini

Claude Opus

Claude Sonnet

Gemini 2.5 Pro

Gemini Flash

Qwen

Llama

Mistral

DeepSeek

Changing the selected model should instantly recalculate:

Input cost

Output cost

Total savings

Without re-running optimization.

---

# Cost Visualization

Show small visual comparison.

Example:

Original Cost

██████████████ $3.82

Compressed Cost

██ $0.19

Savings

95%

---

# Context Budget Visualization

A dedicated visualization showing where the context budget is allocated.

Before optimization:

Logs

JSON

Code

Stack traces

Markdown

Chat

Miscellaneous

After optimization:

Important Logs

Summaries

Knowledge

Critical Code

Important Metadata

This helps users understand what information was preserved.

---

# Pipeline Explanation Section

Collapsible.

Collapsed by default.

Title:

"Optimization Pipeline"

Expanding reveals every stage.

Each stage is shown as an individual expandable card.

---

## Stage 1 — Input Analysis

Display:

Detected content types

Confidence

Estimated complexity

Detected language

Document statistics

Reasons behind detection

Example:

Detected:

* Logs
* JSON
* Stack traces

Confidence:

96%

Reason:

Repeated timestamps

Repeated UUIDs

Structured JSON

Stack traces detected

---

## Stage 2 — Strategy Planner

Display:

Optimization goal

Target token budget

Selected pipeline

Reasoning behind selection

Example:

Goal:

Fit inside 8K context.

Selected:

Headroom

↓

Toonify

↓

LongLLMLingua

↓

Validation

Why:

Headroom performs best for repetitive logs.

Toonify reduces recurring stack traces.

LongLLMLingua removes remaining low-information tokens.

---

## Stage 3 — Pipeline Execution

Each optimization method gets its own expandable card.

For every stage display:

Method name

Description

Input tokens

Output tokens

Compression ratio

Execution time

Reduction percentage

Quality score

Status

Possible stages include:

Headroom

Toonify

Ponytail

Claw

LLMLingua

LongLLMLingua

RECOMP

Nuggets

xRAG

500xCompressor

Summarizer

Custom plugins

---

## Stage 4 — Validation

Display:

Semantic similarity

Information retained

Quality estimation

Compression accepted

Warnings

Fallbacks used

---

## Stage 5 — Final Output

Show:

Final token count

Total reduction

Pipeline summary

Total execution time

---

# Advanced Mode

Hidden by default.

A secondary button near the optimize button.

Instead of naming it "Advanced Mode", use a more inviting label such as:

Pipeline Builder

Custom Pipeline

Strategy Builder

Optimization Lab

When opened, reveal advanced controls.

---

# Pipeline Builder

Allow users to manually override automatic decisions.

Controls include:

Content Type

Dropdown:

Auto Detect

Logs

Code

JSON

Markdown

RAG

Mixed

Chat History

Knowledge Base

---

Target Context Budget

Slider

Examples:

2K

4K

8K

16K

32K

64K

Custom

---

Optimization Goal

Radio buttons.

Maximum Compression

Highest Quality

Balanced

Lowest Cost

Fastest

Custom

---

Pipeline Selection

Checklist.

Each strategy can be enabled or disabled.

Headroom

Toonify

Ponytail

Claw

LLMLingua

LongLLMLingua

RECOMP

Nuggets

xRAG

500xCompressor

Allow drag-and-drop reordering.

Example:

Headroom

↓

LLMLingua

↓

Validation

↓

Summarization

---

Stage Configuration

Each stage should expose settings.

Examples:

Compression aggressiveness

Similarity threshold

Token target

Execution timeout

Maximum iterations

Enable validation

Fallback strategy

---

# Comparison View

Optional tab.

Compare multiple optimization strategies.

Columns:

Strategy

Tokens

Compression Ratio

Execution Time

Retention

Cost

Quality

Winner

Highlight the recommended pipeline.

---

# Diff Viewer

Optional tab.

Side-by-side comparison.

Original

Optimized

Highlight:

Removed repetitions

Collapsed stack traces

Normalized timestamps

Deduplicated JSON

Summarized sections

Color-coded differences.

---

# Optimization Timeline

Horizontal timeline.

Input

↓

Detection

↓

Planning

↓

Compression

↓

Validation

↓

Output

Each node shows:

Duration

Status

Tokens before

Tokens after

---

# Activity Log

Collapsed by default.

Terminal-style appearance.

Shows chronological events.

Example:

[10:24:11]

Input received

[10:24:12]

Detected content: Logs

[10:24:12]

Running Headroom

[10:24:13]

Completed

145K → 41K

[10:24:14]

Running LLMLingua

41K → 12K

[10:24:15]

Running LongLLMLingua

12K → 7.9K

[10:24:16]

Validation complete

97.8% similarity

Useful for debugging.

---

# Plugin Awareness

The UI should treat optimization methods as plugins.

The architecture should support easily adding future optimizers without redesigning the interface.

New plugins should automatically appear in:

* Pipeline Builder
* Pipeline Execution
* Comparison View
* Metrics
* Logs

---

# UX Principles

The interface should embody the following principles:

* Clean and minimal, avoiding visual clutter.
* Progressive disclosure: beginners see only the essentials; advanced users can reveal deeper controls.
* Every optimization decision should be transparent and explainable.
* Smooth transitions and subtle animations should reinforce progress without being distracting.
* Metrics should update dynamically wherever possible (for example, changing the pricing model should instantly recalculate costs without rerunning the optimization).
* Information hierarchy should make the primary workflow—paste, optimize, copy—obvious within seconds.
* Every section should have a clear purpose, with generous spacing, consistent card layouts, and intuitive interactions that make the application feel like a polished, production-ready developer tool rather than a generic dashboard.
