<?php

namespace App\Filament\Resources;

use App\Filament\Resources\CollectionResource\Pages;
use App\Models\Collection;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Str;

class CollectionResource extends Resource
{
    protected static ?string $model = Collection::class;

    protected static ?string $navigationIcon = 'heroicon-o-fire';

    protected static ?string $navigationGroup = 'Каталог';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'коллекцию';

    protected static ?string $pluralModelLabel = 'Коллекции';

    public static function form(Form $form): Form
    {
        return $form->schema([
            Forms\Components\TextInput::make('name')->label('Название')->required()->maxLength(255)
                ->helperText('Формат «Drop 02 — Название»: часть до тире — крупный заголовок на главной.')
                ->live(onBlur: true)
                ->afterStateUpdated(fn (string $operation, $state, Forms\Set $set) => $operation === 'create'
                    ? $set('slug', Str::slug($state, '-', 'ru')) : null),
            Forms\Components\TextInput::make('slug')->label('Адрес (slug)')->required()->maxLength(255)
                ->alphaDash()->unique(ignoreRecord: true),
            Forms\Components\TextInput::make('tagline')->label('Подзаголовок')->maxLength(255)
                ->placeholder('Осень–зима 2026'),
            Forms\Components\DatePicker::make('released_at')->label('Дата выхода'),
            Forms\Components\Textarea::make('description')->label('Описание')->rows(3)->columnSpanFull(),
            Forms\Components\FileUpload::make('hero_image')->label('Фото для главной (hero)')
                ->image()->imageEditor()->disk('public')->directory('collections')->maxSize(8192)->columnSpanFull(),
            Forms\Components\Toggle::make('is_current')->label('Текущий дроп')
                ->helperText('Показывается на главной. У остальных коллекций отметка снимется автоматически.'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('released_at', 'desc')
            ->columns([
                Tables\Columns\ImageColumn::make('hero_image')->label('')->disk('public')->height(48)->width(48),
                Tables\Columns\TextColumn::make('name')->label('Название')->searchable(),
                Tables\Columns\TextColumn::make('products_count')->label('Товаров')->counts('products'),
                Tables\Columns\TextColumn::make('released_at')->label('Дата выхода')->date('d.m.Y')->sortable(),
                Tables\Columns\IconColumn::make('is_current')->label('Текущий')->boolean(),
            ])
            ->actions([Tables\Actions\EditAction::make(), Tables\Actions\DeleteAction::make()]);
    }

    public static function getPages(): array
    {
        return ['index' => Pages\ManageCollections::route('/')];
    }
}
