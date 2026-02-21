import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Personal from "./pages/Personal";
// import Email from "./pages/Email";
import EmailOtp from "./pages/EmailOtp";
import Chat from "./pages/chat";
import OTP from "./pages/OTP";
// import Register from "./pages/Register";
// import Dycurd from './pages/Dycurd'

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Navigate to="/Personal" />} />
        <Route path="/Personal" element={<Personal />} />
        <Route path="/chat" element={<Chat />} />
        {/* <Route path="/email" element={<Email />} /> */}
        <Route path="/email-otp" element={<EmailOtp />} />
        {/* <Route path="/Register" element={<Register />} /> */}
        {/* <Route path="/Dycurd" element={<Dycurd />} /> */}
        <Route path="/OTP" element={<OTP />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
