<script lang="ts">
  // Sino com o histórico de avisos. "rail" = item do menu lateral; "fab" = botão flutuante no celular.
  import Icon from './Icon.svelte';
  import { notices } from '../notices.svelte';
  let { variant = 'rail' }: { variant?: 'rail' | 'fab' } = $props();
  let open = $state(false);

  const ago = (t: number) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `há ${h} h` : new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };
  function toggle() { open = !open; if (!open) notices.markAllRead(); }
  function close() { open = false; notices.markAllRead(); }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

<button class={variant} class:on={open} onclick={toggle} aria-label="Avisos" title="Avisos">
  <Icon name="bell" />
  {#if notices.unread}<span class="dot">{notices.unread > 9 ? '9+' : notices.unread}</span>{/if}
  {#if variant === 'rail'}<small>Avisos</small>{/if}
</button>

{#if open}
  <button class="scrim" aria-label="Fechar" onclick={close}></button>
  <div class="panel {variant}" role="dialog" aria-label="Avisos">
    <div class="head"><strong>Avisos</strong>{#if notices.history.length}<button class="link" onclick={() => notices.clear()}>Limpar</button>{/if}</div>
    {#if !notices.history.length}
      <p class="empty">Nada por aqui ainda. Novidades do catálogo, pedidos que chegaram e mensagens do servidor aparecem aqui.</p>
    {:else}
      <div class="list">
        {#each notices.history as n (n.id)}
          <a class="row" class:unread={!n.read} href={n.itemId ? `#/item/${n.itemId}` : undefined} onclick={close}>
            {#if n.image}<img src={n.image} alt="" loading="lazy" />{:else}<span class="ic"><Icon name={n.kind === 'message' ? 'chat' : 'bell'} size={18} /></span>{/if}
            <span class="txt"><b>{n.title}</b><small>{n.text}</small><i>{ago(n.time)}</i></span>
          </a>
        {/each}
      </div>
    {/if}
    <a class="cfg" href="#/settings" onclick={close}>Ajustar avisos</a>
  </div>
{/if}

<style>
  button.rail{position:relative;width:80px;padding:10px 4px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--muted);background:transparent;border:0;cursor:pointer;font:inherit;transition:background .2s,color .2s}
  button.rail:hover{background:var(--surface2);color:var(--text)}
  button.rail.on{color:var(--orange);background:rgba(255,122,0,.14)}
  button.rail small{font-size:11px;font-weight:600}
  button.fab{display:none}
  .dot{position:absolute;top:4px;right:18px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--orange);color:#000;font-size:11px;font-weight:800;display:grid;place-items:center}
  .scrim{position:fixed;inset:0;z-index:40;background:transparent;border:0;cursor:default}
  .panel{position:fixed;z-index:41;left:calc(var(--rail) + 10px);bottom:20px;width:min(400px,calc(100vw - 32px));max-height:min(70vh,560px);display:flex;flex-direction:column;background:#181818;border:1px solid #2a2a2a;border-radius:16px;box-shadow:0 20px 60px #000;overflow:hidden}
  .head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
  .head strong{font-size:17px}
  .link{background:none;border:0;color:var(--orange-soft,#ffa04d);cursor:pointer;font:inherit;font-size:13px}
  .empty{color:var(--muted);font-size:14px;padding:6px 16px 16px;margin:0}
  .list{overflow-y:auto;padding:0 8px 8px}
  .row{display:flex;gap:12px;padding:10px 8px;border-radius:10px;color:#eee;text-decoration:none}
  .row:hover{background:#242424}
  .row.unread{background:rgba(255,122,0,.08)}
  .row img{width:38px;height:56px;object-fit:cover;border-radius:5px;flex:none;background:#222}
  .ic{width:38px;height:38px;border-radius:50%;background:#2a2a2a;display:grid;place-items:center;flex:none;color:var(--orange)}
  .txt{display:flex;flex-direction:column;gap:2px;min-width:0}
  .txt b{font-size:14px}
  .txt small{color:#bbb;font-size:13px;line-height:1.35}
  .txt i{color:#777;font-size:12px;font-style:normal}
  .cfg{display:block;padding:12px 16px;border-top:1px solid #262626;color:var(--muted);font-size:13px;text-align:center}
  @media (max-width:900px){
    button.fab{display:grid;place-items:center;position:fixed;top:12px;right:12px;z-index:21;width:44px;height:44px;border-radius:50%;border:0;background:rgba(20,20,20,.85);backdrop-filter:blur(8px);color:#fff;cursor:pointer}
    button.fab .dot{top:-2px;right:-2px}
    .panel{left:16px;right:16px;width:auto;top:64px;bottom:auto}
  }
</style>
