/** @type {import('tailwindcss').Config} */
export default {
    content: ['./resources/**/*.blade.php', './app/Livewire/**/*.php'],
    theme: {
        extend: {
            colors: {
                ink: '#0a0a0a',
                coal: '#141414',
                line: '#262626',
                ash: '#8c8c87',
                bone: '#f1f0eb',
            },
            fontFamily: {
                sans: ['"Inter Tight Variable"', 'Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
