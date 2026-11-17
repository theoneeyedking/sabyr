<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Collection;
use App\Models\Product;
use App\Models\User;
use App\Support\Placeholder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@brand.kz'],
            ['name' => 'Admin', 'password' => 'password'],
        );

        $disk = Storage::disk('public');

        $categories = collect([
            ['Куртки', 'kurtki'], ['Футболки', 'futbolki'], ['Штаны', 'shtany'], ['Худи', 'hudi'],
        ])->mapWithKeys(fn ($c, $i) => [
            $c[1] => Category::create(['name' => $c[0], 'slug' => $c[1], 'sort' => $i + 1]),
        ]);

        $disk->put('collections/drop-02.svg', Placeholder::hero('DROP 02'));
        $disk->put('collections/drop-01.svg', Placeholder::hero('DROP 01'));

        $drop2 = Collection::create([
            'name' => 'Drop 02 — Ночная смена',
            'slug' => 'drop-02',
            'tagline' => 'Осень–зима 2026',
            'description' => 'Вторая капсула BRAND: плотные ткани, свободный крой и чёрный во всех его оттенках. Сшито в Алматы ограниченным тиражом.',
            'hero_image' => 'collections/drop-02.svg',
            'is_current' => true,
            'released_at' => '2026-11-01',
        ]);

        $drop1 = Collection::create([
            'name' => 'Drop 01 — База',
            'slug' => 'drop-01',
            'tagline' => 'Весна–лето 2026',
            'description' => 'Первая капсула: базовые вещи на каждый день.',
            'hero_image' => 'collections/drop-01.svg',
            'is_current' => false,
            'released_at' => '2026-04-15',
        ]);

        // [дроп, категория, название, цена, старая цена, тон, остатки S/M/L/XL, состав, описание]
        $products = [
            [$drop2, 'kurtki', 'Бомбер «Алатау»', 54900, 64900, 'dark', [3, 5, 4, 0], 'Нейлон 100%, утеплитель 120 г',
                'Укороченный бомбер свободного кроя с плотной подкладкой и двумя внутренними карманами.'],
            [$drop2, 'hudi', 'Худи «Кок-Тобе»', 29900, null, 'bone', [6, 8, 5, 2], 'Хлопок 80%, полиэстер 20%, 420 г/м²',
                'Тяжёлое оверсайз-худи с начёсом, двойным капюшоном и вышивкой на груди.'],
            [$drop2, 'shtany', 'Карго «Райымбек»', 32900, null, 'mid', [4, 4, 0, 3], 'Хлопок 100%, рипстоп',
                'Широкие карго из рипстопа с объёмными карманами и регулируемым низом.'],
            [$drop2, 'futbolki', 'Футболка «727»', 12900, null, 'light', [10, 12, 9, 6], 'Хлопок 100%, 240 г/м²',
                'Плотная футболка прямого кроя с принтом 727 на спине — телефонный код Алматы.'],
            [$drop2, 'kurtki', 'Пуховик «Шымбулак»', 89900, null, 'bone', [0, 0, 0, 0], 'Нейлон 100%, пух 90/10',
                'Объёмный пуховик с высоким воротником. Тираж распродан.'],
            [$drop2, 'hudi', 'Зип-худи «Орбита»', 34900, 39900, 'dark', [2, 3, 3, 1], 'Хлопок 80%, полиэстер 20%, 420 г/м²',
                'Худи на двухзамковой молнии с прямым силуэтом и заниженной линией плеча.'],
            [$drop2, 'shtany', 'Джинсы «Терренкур»', 36900, null, 'light', [3, 5, 4, 2], 'Деним 14 oz, хлопок 100%',
                'Широкие джинсы из плотного денима с лёгкой стиркой.'],
            [$drop1, 'futbolki', 'Футболка оверсайз «Арбат»', 14900, 17900, 'mid', [5, 0, 7, 4], 'Хлопок 100%, 260 г/м²',
                'Оверсайз-футболка с плотной горловиной и небольшим логотипом на груди.'],
            [$drop1, 'futbolki', 'Лонгслив «Тастак»', 16900, null, 'dark', [4, 6, 5, 3], 'Хлопок 100%, 240 г/м²',
                'Лонгслив свободного кроя с манжетами и принтом на рукаве.'],
            [$drop1, 'hudi', 'Худи «Медеу»', 27900, null, 'mid', [0, 0, 0, 0], 'Хлопок 80%, полиэстер 20%, 380 г/м²',
                'Базовое худи без начёса. Тираж распродан.'],
            [$drop1, 'shtany', 'Джоггеры «Самал»', 24900, 28900, 'dark', [6, 6, 4, 0], 'Хлопок 80%, полиэстер 20%, 380 г/м²',
                'Джоггеры из футера с манжетами и карманами на молнии.'],
            [$drop1, 'kurtki', 'Ветровка «Сайран»', 39900, null, 'light', [2, 4, 4, 2], 'Нейлон 100%, мембрана',
                'Лёгкая ветровка-анорак с капюшоном и светоотражающим логотипом.'],
        ];

        foreach ($products as $i => [$collection, $cat, $name, $price, $oldPrice, $tone, $stock, $composition, $description]) {
            $slug = Str::slug($name, '-', 'ru');
            $caption = sprintf('%s / %02d', Str::upper($collection->slug), $i + 1);
            $tones = [$tone, $tone === 'light' ? 'mid' : 'light', $tone];

            $images = [];
            foreach (['front', 'back', 'detail'] as $n => $view) {
                $path = "products/{$slug}-".($n + 1).'.svg';
                $disk->put($path, Placeholder::product($cat, $tones[$n], $view, $caption));
                $images[] = $path;
            }

            $product = Product::create([
                'collection_id' => $collection->id,
                'category_id' => $categories[$cat]->id,
                'name' => $name,
                'slug' => $slug,
                'description' => $description,
                'composition' => $composition,
                'price' => $price,
                'old_price' => $oldPrice,
                'images' => $images,
                'sort' => $i + 1,
            ]);

            foreach (['S', 'M', 'L', 'XL'] as $n => $size) {
                $product->variants()->create(['size' => $size, 'stock' => $stock[$n], 'sort' => $n + 1]);
            }
        }
    }
}
