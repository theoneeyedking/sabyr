<div>
    @if ($done)
        <p class="display text-2xl md:text-3xl" role="status">Готово. Напишем перед следующим дропом.</p>
    @else
        <form wire:submit="subscribe" novalidate>
            <label for="newsletter-email" class="label text-ash">E-mail</label>
            <div class="mt-2 flex gap-4 border-b border-bone">
                <input id="newsletter-email" type="email" wire:model="email" placeholder="you@mail.kz" autocomplete="email"
                       class="h-14 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-lg placeholder:text-ash/60 focus:outline-none focus:ring-0">
                <button type="submit" class="label shrink-0 hover:text-ash">Подписаться →</button>
            </div>
            @error('email') <p class="mt-3 text-sm text-bone" role="alert">— {{ $message }}</p> @enderror
            <p class="mt-3 text-xs text-ash">Только анонсы дропов. Без спама.</p>
        </form>
    @endif
</div>
