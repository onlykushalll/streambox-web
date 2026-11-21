# StreamBox Web

Player web do StreamBox (mesmo visual preto e laranja do app), feito em **Svelte 5 + TypeScript**.
Os usuários entram com a conta do **Jellyfin** e o Jellyfin fica escondido atrás do domínio.

## O que tem

- Login com usuário e senha ou **Conexão rápida** (Quick Connect)
- Início com destaque em carrossel, Continuar assistindo, Próximos episódios, **Para você que assistiu…**, **Seu pedido chegou** e "Adicionados" por biblioteca
- Todas as bibliotecas, coleções, detalhes de filmes e séries com temporadas
- Player com:
  - legendas (inclusive busca e download online) e personalização de tamanho, cor e fundo
  - troca de áudio e de qualidade (HLS)
  - atalhos de teclado e progresso salvo no Jellyfin
  - aviso quando o formato não roda direto no navegador (o servidor converte), com sugestão do app Android/computador para assistir na qualidade original
- **Avisos**: mensagens do painel do Jellyfin, novidades do catálogo e "Seu pedido chegou", com histórico no sino e notificação do navegador (opcional)
- **TV ao vivo**:
  - canais do Jellyfin
  - uma **lista M3U/EPG própria**, repassada pelo STRM Indexer (sem CORS e sem conteúdo misto)
- Busca em três partes:
  - na biblioteca
  - **listas STRM** para solicitar (aprovação automática quando a fonte responde)
  - **Seerr** (opcional)
- Protetor de tela com pôsteres do catálogo quando nada está tocando
- Funciona no computador, no celular e no tablet; dá para instalar como app (PWA)

## Novidades da v1.9

### Player: formatos que o navegador não toca
- Quando o servidor precisa converter o vídeo (ou só o áudio), o player avisa **"Convertendo no servidor…"** em vez de ficar só carregando.
- Junto aparece um cartão sugerindo o **app StreamBox** (Android ou computador, conforme o aparelho), onde o vídeo toca **na qualidade original, sem conversão e sem espera**. Os botões são **Baixar o app** (abre os Downloads numa aba nova, sem parar o vídeo), **Agora não** e **Não mostrar mais**.
- Quando o vídeo começa a tocar, o cartão vira uma faixa pequena no topo e some sozinho depois de 12 s.
- Se o arquivo original passar de 12 s carregando, aparece **"Está demorando para abrir?"** com o botão **Converter no servidor**.
- O jeito de tocar não mudou. Se a pessoa escolher uma qualidade menor de propósito, a sugestão do app não aparece.

### Tela inicial (como no app Android)
- **Para você que assistiu X**: títulos parecidos com o que a pessoa viu por último. Quando vêm poucos, completa com títulos do mesmo gênero. São até 2 fileiras, e só aparecem quando já há histórico.
- **Seu pedido chegou**: pedidos que já estão no catálogo. Junta os pedidos feitos na busca deste navegador com os que o STRM Indexer e o Seerr conhecem de outros aparelhos.
- As duas fileiras carregam depois do resto, então a tela inicial não fica mais lenta.
- **Destaque que encolhe ao rolar** (só em telas largas, como o PC): ao rolar as fileiras para baixo, o banner de cima vira uma faixa baixa com só o nome e as informações do título em foco, e as fileiras passam a ocupar quase a tela toda. Ao voltar ao topo, o banner abre de novo com a sinopse e os botões. No celular continua o carrossel normal.

### Avisos
- **Mensagens do painel do Jellyfin** em tempo real. Para enviar uma: Painel → Sessões → sessão "StreamBox Web" → Enviar mensagem.
- **Novidades do catálogo** e **Seu pedido chegou**: confere a cada 15 min e também quando a biblioteca muda.
- **Onde aparecem**:
  - um cartão no canto da tela, que também aparece dentro do player em tela cheia;
  - o **sino** com o histórico (no menu lateral; no celular, um botão flutuante no canto);
  - **notificação do navegador**, se a pessoa permitir. Ela só aparece com a aba em segundo plano ou o vídeo em tela cheia.
- Em **Ajustes**, as seções novas **Avisos** (cada tipo liga e desliga) e **Player** (mostrar ou não a sugestão do app).

### Limitações
- Os pedidos do Seerr feitos em outros aparelhos só aparecem com login pela **conta do Jellyfin**. Com a chave de API, todo pedido sai como administrador.
- Os avisos só chegam com o site aberto. Não há push em segundo plano com o navegador fechado.
- A fileira "Seu pedido chegou" usa o endpoint `/mine` do STRM Indexer. Indexador sem esse endpoint mostra só os pedidos feitos neste navegador.

### Atualizar a partir da v1.8
```bash
cd /mnt/sdb1/streambox-web/streambox-web
unzip -o ../streambox-web-v1.9-patch.zip
docker compose up -d --build
```
Depois, recarregue o site com Ctrl+F5.

## Como funciona

```
navegador ─▶ midia.pecbox.com.br (cloudflared) ─▶ streambox-web :8095 (nginx)
                                                     ├─ /           página
                                                     ├─ /api/       → Jellyfin  127.0.0.1:8096
                                                     ├─ /strm-api/  → Indexador 127.0.0.1:8794
                                                     └─ /seerr/     → Seerr     127.0.0.1:5055
```

Tudo passa pelo mesmo endereço, então o navegador não vê o IP nem a porta do Jellyfin.
A interface web original do Jellyfin (`/api/web`) fica bloqueada neste domínio.

## Instalação no boxserver

### 1. Atualize o STRM Indexer (TV ao vivo M3U)

Copie os dois arquivos de `strm-indexer-patch/` para a pasta do indexador (faça um backup antes) e reinicie:

```bash
cd /mnt/sdb1/strm-indexer
mkdir -p backup-$(date +%F) && cp jellyfin_bridge.py backup-$(date +%F)/
cp /caminho/do/zip/strm-indexer-patch/live_relay.py /caminho/do/zip/strm-indexer-patch/jellyfin_bridge.py .
docker compose restart
curl -s http://127.0.0.1:8794/strm-api/health     # {"ok": true, "jellyfin": true}
```

### 2. Suba o StreamBox Web

```bash
cd /mnt/sdb1/streambox-web
nano docker-compose.yml     # confira as portas do Jellyfin, indexador e Seerr
docker compose up -d --build
curl -s http://127.0.0.1:8095/api/System/Info/Public   # deve responder o JSON do Jellyfin
```

No `docker-compose.yml`, deixe `INDEXER_URL` ou `SEERR_URL` vazio para desligar essa parte.

### 3. Aponte midia.pecbox.com.br para o boxserver

1. No painel da Cloudflare (DNS), **apague** o registro atual de `midia` (o que aponta para o IP da VPS).
2. No boxserver, crie a rota do túnel:
   ```bash
   cloudflared tunnel route dns 5bd31b57-c356-4648-bd29-1778a7fa2e1f midia.pecbox.com.br
   ```
3. No `config.yml` do cloudflared, adicione esta regra **antes** da regra final `http_status:404`:
   ```yaml
     - hostname: midia.pecbox.com.br
       service: http://localhost:8095
   ```
4. Reinicie o túnel: `sudo systemctl restart cloudflared`
5. Abra **https://midia.pecbox.com.br**.

### 4. Ajustes recomendados no Jellyfin

- Em **Painel → Rede → Proxies conhecidos**, adicione `127.0.0.1`. Assim o Jellyfin registra o IP real de quem assiste.
- Em **Painel → Geral**, ative **Permitir conexão rápida** para usar o login por código.

## Outros apps

- **App StreamBox (Android)** a partir da versão 0.5.1: use `https://midia.pecbox.com.br`. O app descobre o `/api` sozinho.
- **Wholphin, Jellyfin oficial e outros clientes**: continuem usando `https://jellyfin.pecbox.com.br`.

## Desenvolvimento

```bash
npm install
JELLYFIN_URL=http://192.168.1.16:8096 INDEXER_URL=http://127.0.0.1:8794 SEERR_URL=http://127.0.0.1:5055 npm run dev
npm run check   # verificação de tipos
npm run build   # gera dist/
```

A configuração de produção fica em `/config.js`, gerado na hora em que o contêiner sobe. Não é preciso recompilar para trocar endereços.
