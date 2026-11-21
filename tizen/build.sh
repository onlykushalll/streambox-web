#!/usr/bin/env bash
# Monta o app StreamBox para TV Samsung (Tizen 4.0+, TVs de 2018 em diante).
#
# Uso:  tizen/build.sh                       -> tizen/out/StreamBox-TV-<versão>.wgt (sem assinatura)
#       URL=https://outro.servidor tizen/build.sh
#       TIZEN_PROFILE=meu-perfil tizen/build.sh   -> assina com o Tizen Studio (CLI "tizen" no PATH)
#
# O app é leve: só registra as teclas do controle e abre o StreamBox Web em modo TV (<URL>/tv/).
# Atualizações do site chegam sozinhas, sem reinstalar. Só é preciso gerar de novo se mudar
# o endereço do servidor, o ícone ou a versão.
set -euo pipefail
cd "$(dirname "$0")"
URL="${URL:-https://midia.pecbox.com.br}"
URL="${URL%/}"
VERSION="${VERSION:-1.0.0}"
PACKAGE="${PACKAGE:-SbxPecBox1}"            # 10 letras/números: identifica o app na TV (não mude depois de instalar)
HOST="$(printf '%s' "$URL" | sed -E 's#^https?://##; s#/.*$##')"
WIDGET_ID="${URL}/tv"

rm -rf build out && mkdir -p build out
sed -e "s#@URL@#$URL#g" -e "s#@HOST@#$HOST#g" -e "s#@VERSION@#$VERSION#g" -e "s#@PACKAGE@#$PACKAGE#g" \
    -e "s#@WIDGET_ID@#$WIDGET_ID#g" config.xml.in > build/config.xml
sed -e "s#@URL@#$URL#g" index.html.in > build/index.html
cp icon.png build/icon.png

OUT="out/StreamBox-TV-$VERSION.wgt"
if [ -n "${TIZEN_PROFILE:-}" ] && command -v tizen >/dev/null; then
  # Assinado com o seu certificado Samsung (Tizen Studio > Certificate Manager)
  tizen package -t wgt -s "$TIZEN_PROFILE" -- build
  mv build/*.wgt "$OUT"
  echo ">> $OUT (assinado com o perfil $TIZEN_PROFILE)"
else
  # Sem assinatura: o instalador (Jellyfin2Samsung, opção .wgt personalizado) ou o Tizen Studio assinam na hora
  python3 - "$OUT" <<'PY'
import sys, zipfile, os
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('config.xml', 'index.html', 'icon.png'):
        z.write(os.path.join('build', name), name)
PY
  echo ">> $OUT (sem assinatura)"
fi
