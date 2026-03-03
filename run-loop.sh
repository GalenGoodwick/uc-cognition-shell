#!/bin/bash
cd /Users/galengoodwick/Documents/GitHub/uc-cognition-shell
LOG="growth-$(date +%Y%m%d-%H%M%S).log"
echo "Shell Cradle growth loop started at $(date)" | tee "$LOG"
echo "Logging to $LOG" | tee -a "$LOG"
echo "---" >> "$LOG"

for i in $(seq 1 50); do
  echo "=== Session batch $i/50 — $(date) ===" >> "$LOG"
  node cognition.js 2>&1 | tee -a "$LOG" | grep -E "(WAKES|SYNTHESIS|\".*\"|Hop forces|Word forces)"
  echo "" >> "$LOG"
  sleep 2
done

echo "Growth loop complete at $(date)" | tee -a "$LOG"
