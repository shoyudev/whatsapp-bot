#!/bin/bash

# Verifica se o chromium-browser existe
if [ -f /usr/bin/chromium-browser ]; then
    echo "/usr/bin/chromium-browser existe."
else
    echo "/usr/bin/chromium-browser NÃO existe."
fi

# Verifica se o chromium existe
if [ -f /usr/bin/chromium ]; then
    echo "/usr/bin/chromium existe."
else
    echo "/usr/bin/chromium NÃO existe."
fi

# Lista o conteúdo de /usr/bin para ver executáveis relacionados ao chromium
ls -l /usr/bin | grep -i chromium

# Tenta encontrar o executável do chromium usando `which`
which chromium
which chromium-browser

# Tenta executar o chromium com a flag --version
/usr/bin/chromium --version

