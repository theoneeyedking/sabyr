<?php

namespace App\Support;

class Money
{
    /** 24900 → «24 900 ₸» (с неразрывными пробелами). */
    public static function format(int $amount): string
    {
        return number_format($amount, 0, ',', "\u{00A0}")."\u{00A0}₸";
    }
}
