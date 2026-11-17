<?php

namespace App\Support;

class Ru
{
    /** Ru::plural(7, 'позиция', 'позиции', 'позиций') → «позиций». */
    public static function plural(int $n, string $one, string $few, string $many): string
    {
        $n = abs($n) % 100;
        $d = $n % 10;

        return match (true) {
            $n > 10 && $n < 20 => $many,
            $d === 1 => $one,
            $d >= 2 && $d <= 4 => $few,
            default => $many,
        };
    }
}
