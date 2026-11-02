#!/bin/bash
# usage: rss_sampler.sh <pid> <outfile> <seconds>
end=$(( $(date +%s) + $3 )); while [ $(date +%s) -lt $end ] && [ -e /proc/$1 ]; do echo "$(date +%s) $(grep VmRSS /proc/$1/status | awk '{print $2}')" >> $2; sleep 10; done
