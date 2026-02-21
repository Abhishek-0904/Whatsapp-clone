import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./EmailOtp.css";

const EmailOtp = () => {
  const navigate = useNavigate("/.chat"); // for redirecting
  const email = localStorage.getItem("email");
  const storedOtp = localStorage.getItem("otp");
  const storedExpiry = localStorage.getItem("otpExpiry");

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [message, setMessage] = useState("");
  const [resendTimer, setResendTimer] = useState(30);

  const inputRefs = useRef([]);

  /* ================= TIMER ================= */
  useEffect(() => {
    if (resendTimer === 0) return;
    const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  /* ================= INPUT CHANGE ================= */
  const handleChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  /* ================= BACKSPACE ================= */
  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  /* ================= VERIFY OTP ================= */
  const verifyOtp = () => {
    const enteredOtp = otp.join("");

    if (enteredOtp.length < 6) {
      setMessage("❌ Enter complete OTP");
      return;
    }

    if (!storedOtp || !storedExpiry) {
      setMessage("❌ OTP not found");
      return;
    }

    if (Date.now() > storedExpiry) {
      setMessage("❌ OTP expired");
      return;
    }

    if (enteredOtp === storedOtp) {
      setMessage("✅ Email verified successfully!");
      localStorage.removeItem("otp");
      localStorage.removeItem("otpExpiry");

      // Redirect to Chat.jsx after OTP verification
      navigate("/chat");
    } else {
      setMessage("❌ Invalid OTP");
    }
  };

  /* ================= RESEND OTP ================= */
  const resendOtp = () => {
    if (resendTimer > 0) return;

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

    localStorage.setItem("otp", newOtp);
    localStorage.setItem("otpExpiry", Date.now() + 5 * 60 * 1000);

    alert(`New OTP: ${newOtp}`);
    setOtp(["", "", "", "", "", ""]);
    setMessage("✅ OTP resent");
    setResendTimer(30);
    inputRefs.current[0].focus();
  };

  return (
    <div className="otp-container">
      <div className="otp-card">
        <h2>OTP Verification</h2>
        <p>
          Enter the OTP sent to <b>{email}</b>
        </p>

        <div className="otp-inputs">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              maxLength="1"
              value={digit}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            />
          ))}
        </div>

        <button className="verify-btn" onClick={verifyOtp}>
          Verify OTP
        </button>

        <button
          className={`resend-btn ${resendTimer > 0 ? "disabled" : ""}`}
          onClick={resendOtp}
        >
          {resendTimer > 0
            ? `Resend OTP in ${resendTimer}s`
            : "Resend OTP"}
        </button>

        <p className="message">{message}</p>
      </div>
    </div>
  );
};

export default EmailOtp;
