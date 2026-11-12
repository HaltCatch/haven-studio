#!/bin/sh
set -eu
: "${HAVEN_API_TOKEN:?HAVEN_API_TOKEN is required}"
: "${HAVEN_PUBLIC_ORIGIN:?HAVEN_PUBLIC_ORIGIN is required}"
: "${HAVEN_API_UPSTREAM:=haven-api:3000}"
# Values inserted into native nginx configuration must not contain config syntax.
case "$HAVEN_API_TOKEN" in *[!A-Za-z0-9_-]*|'') exit 1;; esac
case "$HAVEN_PUBLIC_ORIGIN" in https://*) ;; *) exit 1;; esac
case "$HAVEN_PUBLIC_ORIGIN" in *[!A-Za-z0-9:/._-]*) exit 1;; esac
case "$HAVEN_API_UPSTREAM" in *[!A-Za-z0-9.:-]*) exit 1;; esac
export HAVEN_API_UPSTREAM
umask 077
mkdir -p /tmp/haven/client /tmp/haven/proxy
envsubst '${HAVEN_API_TOKEN} ${HAVEN_PUBLIC_ORIGIN} ${HAVEN_API_UPSTREAM}' < /etc/haven/nginx.conf.template > /tmp/haven/nginx.conf
exec nginx -c /tmp/haven/nginx.conf -g 'daemon off;'
