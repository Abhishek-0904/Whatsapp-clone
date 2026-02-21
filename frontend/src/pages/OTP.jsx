import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./OTP.css";

const OTP = () => {
  const navigate = useNavigate();
  const [mobileNumber, setMobileNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [inputOtp, setInputOtp] = useState(["", "", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [error, setError] = useState("");

  const sendOTP = () => {
    setLoading(true);
    setError("");
    setInputOtp(["", "", "", "", "", ""]); // Clear inputs on resend

    // Simulate network delay
    setTimeout(() => {
      setLoading(false);

      // Generate OTP
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(newOtp);

      // Show notification
      setTimeout(() => {
        setShowNotification(true);
        // Auto-hide notification
        setTimeout(() => setShowNotification(false), 30000);
      }, 500);

    }, 1500);
  };

  useEffect(() => {
    // 1. Get number from local storage
    const storedPhone = localStorage.getItem("phone");
    if (!storedPhone) {
      navigate("/Personal");
      return;
    }
    setMobileNumber(storedPhone);

    // 2. Send OTP initially
    sendOTP();
  }, [navigate]);

  const handleChange = (element, index) => {
    if (isNaN(element.value)) return;

    const newInputOtp = [...inputOtp];
    newInputOtp[index] = element.value;
    setInputOtp(newInputOtp);

    // Focus next input
    if (element.nextSibling && element.value) {
      element.nextSibling.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !inputOtp[index] && e.target.previousSibling) {
      e.target.previousSibling.focus();
    }
  };

  const verifyOTP = () => {
    const enteredOtp = inputOtp.join("");
    if (enteredOtp === generatedOtp) {
      navigate("/chat");
    } else {
      setError("Incorrect OTP. Please try again.");
    }
  };

  return (
    <div className="otp-container">
      {/* Simulated SMS Notification */}
      {showNotification && (
        <div className="sms-notification">
          <div className="sms-icon">💬</div>
          <div className="sms-content">
            <div className="sms-header">MESSAGES • now</div>
            <div className="sms-body">Your WhatsApp verification code is: <strong>{generatedOtp}</strong></div>
          </div>
        </div>
      )}

      <div className="otp-card">
        <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" className="otp-logo" />

        <h2>Two-Step Verification</h2>
        <p className="otp-instruction">
          Enter the 6-digit PIN sent to <br />
          <span className="user-phone">{mobileNumber}</span>
        </p>

        {loading ? (
          <div className="loading-spinner">Sending OTP...</div>
        ) : (
          <>
            <div className="otp-inputs">
              {inputOtp.map((data, index) => (
                <input
                  className="otp-field"
                  type="text"
                  name="otp"
                  maxLength="1"
                  key={index}
                  value={data}
                  onChange={(e) => handleChange(e.target, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onFocus={(e) => e.target.select()}
                />
              ))}
            </div>

            {error && <p className="status-error">{error}</p>}

            <button className="primary-btn" onClick={verifyOTP}>
              Verify
            </button>

            <p className="resend-text">Didn't receive code? <span onClick={sendOTP} style={{ cursor: "pointer", color: "var(--teal-green)", fontWeight: "bold" }}>Resend SMS</span></p>
          </>
        )}
      </div>
    </div>
  );
};

export default OTP;
