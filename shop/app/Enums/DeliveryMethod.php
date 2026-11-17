<?php

namespace App\Enums;

enum DeliveryMethod: string
{
    case Courier = 'courier';
    case Post = 'post';
    case Pickup = 'pickup';

    public function label(): string
    {
        return match ($this) {
            self::Courier => 'Курьер по Алматы',
            self::Post => 'Доставка по Казахстану',
            self::Pickup => 'Самовывоз',
        };
    }

    public function hint(): string
    {
        return match ($this) {
            self::Courier => '1–2 дня',
            self::Post => '3–7 дней, транспортная компания',
            self::Pickup => 'Алматы, шоурум BRAND',
        };
    }

    /** @return array<string, string> */
    public static function options(): array
    {
        return collect(self::cases())->mapWithKeys(fn (self $m) => [$m->value => $m->label()])->all();
    }
}
