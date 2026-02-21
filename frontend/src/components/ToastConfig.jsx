import { Toaster } from 'react-hot-toast';

export const ToastConfig = () => (
    <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={8}
        containerClassName=""
        containerStyle={{}}
        toastOptions={{
            // Define default options
            className: '',
            duration: 4000,
            style: {
                background: '#fff',
                color: '#333',
                padding: '16px',
                borderRadius: '12px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                fontFamily: 'inherit',
            },
            // Default options for specific types
            success: {
                duration: 3000,
                style: {
                    background: '#d9fdd3',
                    color: '#005c4b',
                    border: '1px solid #c7edfc',
                },
                iconTheme: {
                    primary: '#00a884',
                    secondary: '#fff',
                },
            },
            error: {
                duration: 4000,
                style: {
                    background: '#ffe6e6',
                    color: '#ea0038',
                },
                iconTheme: {
                    primary: '#ea0038',
                    secondary: '#fff',
                },
            },
        }}
    />
);
