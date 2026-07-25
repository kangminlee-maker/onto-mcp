#!/bin/bash
# Deploys the service to the target environment.
source ./lib/common.sh
. ./lib/logging.sh

readonly REGISTRY="registry.example.com"
MAX_RETRIES=3

# build_image builds and tags the container image.
build_image() {
    local tag="$1"
    docker build -t "${REGISTRY}/app:${tag}" .
}

function push_image {
    docker push "${REGISTRY}/app:$1"
}
