import React from "react";
import { sounds } from "@/lib/soundEffects";

interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "confirm" | "flag" | "reject" | "inset";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export function TactileButton({
  children,
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  onClick,
  ...props
}: TactileButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    sounds.playClick(variant === "primary" ? 1100 : 850);
    onClick?.(e);
  };

  return (
    <button
      className={`tactile-btn tactile-btn-${variant} tactile-btn-${size} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {icon && <span className="tactile-btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

interface TactileSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function TactileSwitch({ checked, onChange, label }: TactileSwitchProps) {
  const toggle = () => {
    sounds.playClick(checked ? 750 : 1200);
    onChange(!checked);
  };

  return (
    <label className="tactile-switch-wrap" onClick={toggle}>
      <div className={`tactile-switch-track ${checked ? "on" : "off"}`}>
        <span className="tactile-switch-thumb" />
      </div>
      {label && <span className="tactile-switch-label">{label}</span>}
    </label>
  );
}

interface TactileSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  label?: string;
  unit?: string;
}

export function TactileSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit = "%",
}: TactileSliderProps) {
  return (
    <div className="tactile-slider-box">
      {(label || unit) && (
        <div className="tactile-slider-header">
          {label && <span className="tactile-slider-label">{label}</span>}
          <span className="tactile-slider-badge">
            {value}
            {unit}
          </span>
        </div>
      )}
      <div className="tactile-slider-track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tactile-range-input"
        />
      </div>
    </div>
  );
}

interface TactileTabsProps<T extends string> {
  tabs: { id: T; label: string; count?: number; icon?: React.ReactNode }[];
  activeTab: T;
  onChange: (id: T) => void;
}

export function TactileTabs<T extends string>({ tabs, activeTab, onChange }: TactileTabsProps<T>) {
  return (
    <div className="tactile-tabs-container">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tactile-tab-pill ${isActive ? "active" : ""}`}
            onClick={() => {
              sounds.playClick();
              onChange(tab.id);
            }}
          >
            {tab.icon && <span className="tab-icon">{tab.icon}</span>}
            <span className="tab-label">{tab.label}</span>
            {tab.count !== undefined && <span className="tab-badge">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TactileCard({
  children,
  className = "",
  level = 3,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  level?: 1 | 2 | 3 | 4 | 5;
  onClick?: () => void;
}) {
  return (
    <div className={`tactile-card level-${level} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function TactileStepper({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <div className="tactile-stepper">
      {steps.map((s, idx) => {
        const stepNum = idx + 1;
        const isDone = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <React.Fragment key={s}>
            <div className={`stepper-node ${isCurrent ? "current" : isDone ? "done" : "upcoming"}`}>
              <span className="stepper-bubble">{stepNum}</span>
              <span className="stepper-label">{s}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`stepper-line ${isDone ? "done" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
