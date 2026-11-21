# StreamBox para TV Samsung (Tizen)

App leve para TVs Samsung de **2018 em diante** (Tizen 4.0+). Ele registra as teclas do controle e abre o
StreamBox Web em **modo TV** (`https://midia.pecbox.com.br/tv/`). Por isso:

- **atualizações do site chegam sozinhas**, sem reinstalar nada na TV;
- o visual e o player são os mesmos do StreamBox Web, com navegação pelo controle remoto
  (setas, OK, Voltar, Play/Pause, Canal +/−, Info, Lista de canais, botão vermelho = legendas).

## O que é o `/tv/`

O mesmo código do StreamBox Web, compilado à parte (`npm run build:tv` → `dist-tv`) para o navegador
das TVs de 2018–2020 (Chromium 56–69): JavaScript transpilado com polyfills e CSS convertido
(`tv-postcss.js`). O site normal (`/`) não muda.

| Ano da TV | Tizen | Navegador | Situação esperada (ainda não testado numa TV real) |
|---|---|---|---|
| 2018 | 4.0 | Chromium 56 | funciona; sem CSS Grid, as grades viram uma coluna |
| 2019 | 5.0 | Chromium 63 | completo |
| 2020 | 5.5 | Chromium 69 | completo |
| 2021+ | 6.0+ | Chromium 76+ | completo |

## Gerar o pacote

```bash
tizen/build.sh                          # tizen/out/StreamBox-TV-1.0.0.wgt (sem assinatura)
URL=https://outro.servidor tizen/build.sh
TIZEN_PROFILE=meu-perfil tizen/build.sh # assinado pelo Tizen Studio (CLI "tizen" no PATH)
```

O arquivo também fica na página de **Downloads** (pasta `tv`).

## Instalar na TV

1. **Ligue o modo desenvolvedor na TV:** abra **Apps**, digite **1 2 3 4 5** no controle (sem teclado numérico, use o botão **123**),
   ligue **Developer mode**, informe o **IP do computador** que vai instalar e **reinicie a TV** (desligue da tomada por 30 s).
2. **Mais fácil, com o Jellyfin2Samsung** ([Samsung-Jellyfin-Installer](https://github.com/Jellyfin2Samsung/Samsung-Jellyfin-Installer)):
   abra no computador, escolha a TV, escolha **.wgt personalizado** e aponte para `StreamBox-TV-1.0.0.wgt`.
   Ele cuida do certificado. Conta Samsung só é exigida em TVs com Tizen 7 ou mais novo.
3. **Ou pelo Tizen Studio:** crie um certificado **Samsung** (Certificate Manager, com o DUID da TV), gere o pacote com
   `TIZEN_PROFILE=<perfil> tizen/build.sh` e instale:
   ```bash
   sdb connect <IP-da-TV>
   tizen install -n tizen/out/StreamBox-TV-1.0.0.wgt -t <nome da TV em "sdb devices">
   ```

Quem reinstalar por outro caminho precisa desinstalar antes: certificados diferentes não atualizam o app instalado.

## Dicas de uso

- No login, prefira **Conexão rápida**: aparece um código na TV e a pessoa confirma pelo celular, sem digitar senha no controle.
- Nos campos de texto, o teclado da TV só abre ao apertar **OK**; **Voltar** fecha o teclado.
- **Voltar** na tela inicial fecha o app.
