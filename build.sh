#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Function to safely change directory and track it
safe_pushd() {
    pushd "$1" > /dev/null
    trap popd EXIT
}

safe_pushd "$(dirname "$0")/packages/xash3d-fwgs"

# Build the project using CMake
pnpm run build

popd > /dev/null
trap - EXIT

safe_pushd "$(dirname "$0")/docker/cs-web-server"

export TAG=local

docker compose up -d --build

popd > /dev/null
trap - EXIT

echo "Build and deployment completed successfully."

# End of script