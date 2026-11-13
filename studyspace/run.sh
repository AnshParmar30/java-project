#!/usr/bin/env bash
cd "$(dirname "$0")"
mkdir -p out && javac --release 17 -d out src/*.java && echo "Open http://localhost:8080" && java -cp out StudyCompanionServer
