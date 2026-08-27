#!/bin/bash
OUTBOUND_IP=$(curl -s --max-time 5 ifconfig.me)
echo "CodeBuild outbound IP: $OUTBOUND_IP"
