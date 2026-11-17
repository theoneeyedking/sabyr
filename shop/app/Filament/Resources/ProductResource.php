<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ProductResource\Pages;
use App\Models\Product;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

class ProductResource extends Resource
{
    protected static ?string $model = Product::class;

    protected static ?string $navigationIcon = 'heroicon-o-shopping-bag';

    protected static ?string $navigationGroup = 'Каталог';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'товар';

    protected static ?string $pluralModelLabel = 'Товары';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Form $form): Form
    {
        return $form->schema([
            Forms\Components\Group::make([
                Forms\Components\Section::make('Основное')->schema([
                    Forms\Components\TextInput::make('name')->label('Название')->required()->maxLength(255)
                        ->live(onBlur: true)
                        ->afterStateUpdated(fn (string $operation, $state, Forms\Set $set) => $operation === 'create'
                            ? $set('slug', Str::slug($state, '-', 'ru')) : null),
                    Forms\Components\TextInput::make('slug')->label('Адрес (slug)')->required()->maxLength(255)
                        ->alphaDash()->unique(ignoreRecord: true),
                    Forms\Components\Textarea::make('description')->label('Описание')->rows(4)->columnSpanFull(),
                    Forms\Components\TextInput::make('composition')->label('Состав')->maxLength(255)->columnSpanFull(),
                ])->columns(2),

                Forms\Components\Section::make('Фото')->schema([
                    Forms\Components\FileUpload::make('images')->hiddenLabel()
                        ->multiple()->reorderable()->image()->imageEditor()
                        ->disk('public')->directory('products')->maxSize(8192)->maxFiles(8)
                        ->panelLayout('grid')
                        ->helperText('Первое фото — обложка в каталоге, второе показывается при наведении. Вертикальные, 3:4.'),
                ]),

                Forms\Components\Section::make('Размеры и остатки')->schema([
                    Forms\Components\Repeater::make('variants')->hiddenLabel()
                        ->relationship()
                        ->schema([
                            Forms\Components\TextInput::make('size')->label('Размер')->required()->maxLength(20)->distinct(),
                            Forms\Components\TextInput::make('stock')->label('Остаток, шт.')->numeric()->integer()
                                ->minValue(0)->default(0)->required(),
                        ])
                        ->columns(2)
                        ->orderColumn('sort')
                        ->defaultItems(4)
                        ->addActionLabel('Добавить размер')
                        ->itemLabel(fn (array $state) => $state['size'] ?? null)
                        ->helperText('Если у всех размеров остаток 0, на сайте товар помечается «Sold out».'),
                ]),
            ])->columnSpan(['lg' => 2]),

            Forms\Components\Group::make([
                Forms\Components\Section::make('Цена')->schema([
                    Forms\Components\TextInput::make('price')->label('Цена')->numeric()->integer()->minValue(0)
                        ->required()->suffix('₸'),
                    Forms\Components\TextInput::make('old_price')->label('Старая цена')->numeric()->integer()
                        ->gt('price')->suffix('₸')
                        ->validationMessages(['gt' => 'Старая цена должна быть больше текущей.'])
                        ->helperText('Заполните, чтобы показать скидку: старая цена будет зачёркнута.'),
                ]),
                Forms\Components\Section::make('Размещение')->schema([
                    Forms\Components\Select::make('category_id')->label('Категория')
                        ->relationship('category', 'name')->required()->preload(),
                    Forms\Components\Select::make('collection_id')->label('Коллекция (дроп)')
                        ->relationship('collection', 'name')->preload(),
                    Forms\Components\TextInput::make('sort')->label('Порядок')->numeric()->integer()->default(0)
                        ->helperText('Меньше — выше в каталоге.'),
                    Forms\Components\Toggle::make('is_active')->label('Показывать на сайте')->default(true),
                ]),
            ])->columnSpan(['lg' => 1]),
        ])->columns(3);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->withSum('variants', 'stock'))
            ->defaultSort('sort')
            ->columns([
                Tables\Columns\ImageColumn::make('cover')->label('')
                    ->getStateUsing(fn (Product $record) => $record->images[0] ?? null)
                    ->disk('public')->height(64)->width(48),
                Tables\Columns\TextColumn::make('name')->label('Название')->searchable()->sortable()->wrap(),
                Tables\Columns\TextColumn::make('category.name')->label('Категория')->sortable(),
                Tables\Columns\TextColumn::make('collection.name')->label('Коллекция')->toggleable()->placeholder('—'),
                Tables\Columns\TextColumn::make('price')->label('Цена')->sortable()
                    ->formatStateUsing(fn ($state) => \App\Support\Money::format($state))
                    ->description(fn (Product $record) => $record->hasDiscount()
                        ? 'было '.\App\Support\Money::format($record->old_price) : null),
                Tables\Columns\TextColumn::make('variants_sum_stock')->label('Остаток')->sortable()->badge()
                    ->formatStateUsing(fn ($state) => $state > 0 ? $state.' шт.' : 'Sold out')
                    ->color(fn ($state) => $state > 0 ? 'success' : 'danger'),
                Tables\Columns\ToggleColumn::make('is_active')->label('На сайте'),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('category')->label('Категория')->relationship('category', 'name'),
                Tables\Filters\SelectFilter::make('collection')->label('Коллекция')->relationship('collection', 'name'),
            ])
            ->actions([Tables\Actions\EditAction::make(), Tables\Actions\DeleteAction::make()])
            ->bulkActions([Tables\Actions\DeleteBulkAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListProducts::route('/'),
            'create' => Pages\CreateProduct::route('/create'),
            'edit' => Pages\EditProduct::route('/{record}/edit'),
        ];
    }
}
