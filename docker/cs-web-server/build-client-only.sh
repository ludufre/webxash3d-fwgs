#!/bin/sh

pnpm run build

docker cp src/client/dist/assets cs-web-server-xash3d-1:/xashds/public/
docker cp src/client/dist/admin cs-web-server-xash3d-1:/xashds/public/
docker cp src/client/dist/index.html cs-web-server-xash3d-1:/xashds/public/
