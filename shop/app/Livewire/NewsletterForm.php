<?php

namespace App\Livewire;

use Livewire\Component;

/** Подписка на рассылку — заглушка: адрес проверяется, но никуда не сохраняется. */
class NewsletterForm extends Component
{
    public string $email = '';

    public bool $done = false;

    public function subscribe(): void
    {
        $this->validate(
            ['email' => ['required', 'email', 'max:255']],
            ['email.*' => 'Введите корректный e-mail'],
        );

        $this->done = true;
    }

    public function render()
    {
        return view('livewire.newsletter-form');
    }
}
