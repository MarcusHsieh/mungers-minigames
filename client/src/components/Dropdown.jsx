import { useState, useRef, useEffect } from 'react';
import './Dropdown.css';

function Dropdown({ value, options, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking/touching outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Check viewport boundaries and adjust dropdown direction
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const menuHeight = Math.min(240, options.length * 42); // Approximate menu height

      // Open upward if not enough space below and more space above
      setOpenUpward(spaceBelow < menuHeight && rect.top > menuHeight);
    }
  }, [isOpen, options.length]);

  const handleSelect = (optionValue) => {
    setIsOpen(false);
    onChange(optionValue);
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`custom-dropdown ${isOpen ? 'dropdown-open' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        className={`dropdown-toggle ${isOpen ? 'open' : ''} ${openUpward ? 'open-upward' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="dropdown-label">{selectedOption?.label || 'Select...'}</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={`dropdown-menu ${openUpward ? 'open-upward' : ''}`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`dropdown-item ${option.value === value ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}`}
              onClick={() => !option.disabled && handleSelect(option.value)}
              disabled={option.disabled}
            >
              {option.label}
              {option.value === value && <span className="checkmark">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
