<script lang="ts">
  // Cartões de aviso (mensagem do servidor, novidade, pedido que chegou). Clicar abre o título.
  import { fly } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { notices, type Notice } from '../notices.svelte';
  let { inPlayer = false }: { inPlayer?: boolean } = $props();

  function open(n: Notice) {
    notices.dismiss(n.id);
    if (!n.itemId) return;
    // dentro do player o vídeo continua: abre os detalhes numa aba nova
    if (inPlayer) window.open(`#/item/${n.itemId}`, '_blank', 'noopener');
    else location.hash = `#/item/${n.itemId}`;
  }
</script>

<div class="cards" class:player={inPlayer} aria-live="polite">
  {#each notices.live as n (n.id)}
    <div class="card {n.kind}" transition:fly={{ x: 40, duration: 250 }}>
      <button class="body" onclick={() => open(n)}>
        {#if n.image}<img src={n.image} alt="" />{:else}<span class="ic"><Icon name={n.kind === 'message' ? 'chat' : 'bell'} /></span>{/if}
        <span class="txt"><b>{n.title}</b><small>{n.text}</small></span>
      </button>
      <button class="x" aria-label="Fechar aviso" onclick={() => notices.dismiss(n.id)}><Icon name="close" size={18} /></button>
    </div>
  {/each}
</div>

<style>
  .cards{position:fixed;top:18px;right:18px;z-index:210;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 32px));pointer-events:none}
  .cards.player{position:absolute;top:84px}
  .card{pointer-events:auto;display:flex;align-items:stretch;background:rgba(24,24,24,.97);border:1px solid #2c2c2c;border-left:4px solid var(--orange);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.6);overflow:hidden}
  .card.requested{border-left-color:var(--ok,#34c77b)}
  .card.message{border-left-color:#4da3ff}
  .body{flex:1;min-width:0;display:flex;gap:12px;align-items:center;padding:10px 4px 10px 10px;background:transparent;border:0;color:#fff;text-align:left;cursor:pointer;font:inherit}
  img{width:44px;height:64px;object-fit:cover;border-radius:6px;flex:none;background:#1e1e1e}
  .ic{width:44px;height:44px;border-radius:50%;background:#2a2a2a;display:grid;place-items:center;flex:none;color:var(--orange)}
  .txt{display:flex;flex-direction:column;gap:2px;min-width:0}
  .txt b{font-size:15px}
  .txt small{color:#c8c8c8;font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .x{width:38px;border:0;background:transparent;color:#aaa;cursor:pointer;display:grid;place-items:center}
  .x:hover{color:#fff}
  @media (max-width:900px){.cards:not(.player){top:12px;right:16px}}
</style>
