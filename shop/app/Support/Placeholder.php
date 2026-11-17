<?php

namespace App\Support;

/**
 * Генератор placeholder-фото (SVG) для демо: силуэт вещи на однотонном фоне.
 * В админке их можно заменить настоящими фотографиями.
 */
class Placeholder
{
    private const SHAPES = [
        'kurtki' => '<path d="M210 200 120 290 90 600l60 10 45-250v300h210V360l45 250 60-10-30-310-90-90q-90 50-180 0Z"/>'
            .'<path d="m250 195 50 45 50-45-15-25h-70Z" fill-opacity=".55"/>'
            .'<path d="M300 240v420" stroke-width="3" fill="none" class="l"/>'
            .'<path d="M225 470h45M330 470h45" stroke-width="3" fill="none" class="l"/>',
        'futbolki' => '<path d="m200 180 60-30q40 35 80 0l60 30 100 80-50 70-45-30v350H195V300l-45 30-50-70Z"/>'
            .'<path d="M262 152q38 46 76 0" stroke-width="3" fill="none" class="l"/>',
        'hudi' => '<path d="M210 200 120 290 90 600l60 10 45-250v300h210V360l45 250 60-10-30-310-90-90q-90 50-180 0Z"/>'
            .'<path d="M235 205q-5-95 65-105 70 10 65 105-65 40-130 0Z" fill-opacity=".7"/>'
            .'<path d="M235 520h130l20 100H215Z" stroke-width="3" fill="none" class="l"/>'
            .'<path d="M285 235v70M315 235v70" stroke-width="3" fill="none" class="l"/>',
        'shtany' => '<path d="M200 140h200l30 540H330l-30-380-30 380H170Z"/>'
            .'<path d="M200 168h200" stroke-width="3" fill="none" class="l"/>'
            .'<path d="M192 380h52v80h-56M408 380h-52v80h56" stroke-width="3" fill="none" class="l"/>',
    ];

    /** [фон, вещь, линии, подпись] */
    private const TONES = [
        'dark' => ['#161616', '#2c2c2c', '#0b0b0b', '#5c5c5c'],
        'light' => ['#d9d9d4', '#111111', '#3a3a3a', '#77776f'],
        'mid' => ['#8b8b86', '#151515', '#3a3a3a', '#2e2e2c'],
        'bone' => ['#1b1b1b', '#e6e6df', '#9a9a94', '#5c5c5c'],
    ];

    /** @param 'front'|'back'|'detail' $view */
    public static function product(string $categorySlug, string $tone, string $view, string $caption): string
    {
        [$bg, $fill, $line, $text] = self::TONES[$tone];
        $shape = self::SHAPES[$categorySlug];

        $transform = match ($view) {
            'back' => 'translate(600 0) scale(-1 1)',
            'detail' => 'translate(-330 -260) scale(2.1)',
            default => '',
        };
        $label = ['front' => 'FRONT', 'back' => 'BACK', 'detail' => 'DETAIL'][$view];
        $caption = htmlspecialchars($caption, ENT_XML1);

        return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="1200" height="1600">
<style>.l{stroke:$line}text{font:600 13px Helvetica,Arial,sans-serif;letter-spacing:2px;fill:$text}</style>
<rect width="600" height="800" fill="$bg"/>
<g transform="$transform" fill="$fill">$shape</g>
<text x="28" y="44">BRAND</text>
<text x="572" y="44" text-anchor="end">$label</text>
<text x="28" y="772">$caption</text>
</svg>
SVG;
    }

    public static function hero(string $title): string
    {
        $shape = self::SHAPES['hudi'];
        $title = htmlspecialchars($title, ENT_XML1);

        return <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" width="1600" height="1600">
<style>.l{stroke:#0b0b0b}</style>
<rect width="1600" height="1600" fill="#141414"/>
<circle cx="800" cy="760" r="520" fill="#1c1c1c"/>
<g transform="translate(260 -20) scale(1.8)" fill="#333331">$shape</g>
<g transform="translate(-260 220) scale(1.5)" fill="#222221">$shape</g>
<g transform="translate(960 220) scale(1.5)" fill="#222221">$shape</g>
</svg>
SVG;
    }
}
