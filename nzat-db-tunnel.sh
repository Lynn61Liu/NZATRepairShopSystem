#!/bin/bash

echo "Starting NZAT DB tunnel..."

autossh -M 0 -f -N \
  -L 15432:127.0.0.1:5437 \
  nzat-server

echo "Tunnel started: localhost:15432 -> server:5437"

