import React, { useState } from "react";
import "./Personal.css";
import { useNavigate } from "react-router-dom";


const countries = [
  { name: "India", code: "+91" },
  { name: "United States", code: "+1" },
  { name: "United Kingdom", code: "+44" },
  { name: "Australia", code: "+61" },
  { name: "Canada", code: "+1" },
];

const Personal = () => {
  const navigate = useNavigate();

  const [country, setCountry] = useState(countries[0]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const handleContinue = () => {
    // Validation
    if (!phone) {
      setError("Phone number is required");
      return;
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setError("");
    localStorage.setItem("phone", `${country.code}${phone}`);
    navigate("/OTP");
  };

  return (
    <div className="personal-container">
      <div className="personal-card">
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
          alt="WhatsApp"
          className="personal-logo"
        />

        <h2>WhatsApp Login</h2>
        <p>Sign in using your phone number</p>
        <br></br>

        {/* Country Dropdown */}
        <select
          className="personal-select"
          value={country.code}
          onChange={(e) =>
            setCountry(
              countries.find((c) => c.code === e.target.value)
            )
          }
        >
          {countries.map((c, index) => (
            <option key={index} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>

        {/* Phone Input */}
        <div className="phone-input-box">
          <span className="country-code">{country.code}</span>
          <input
            type="tel"
            placeholder="Enter phone number"
            className="personal-input"
            value={phone}
            maxLength={10}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="personal-btn" onClick={handleContinue}>
          Continue
        </button>

        <p className="personal-note">
          You will receive an OTP to verify your number
        </p>
      </div>
    </div>
  );
};

export default Personal;
