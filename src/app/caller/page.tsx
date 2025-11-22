"use client";

import { useEffect, useState, useCallback } from "react";
import { Device, Call } from "@twilio/voice-sdk";

export default function CallerPage() {
  const [device, setDevice] = useState<Device | null>(null);
  const [connection, setConnection] = useState<Call | null>(null);
  const [callStatus, setCallStatus] = useState("Ready to call");
  const [isCalling, setIsCalling] = useState(false);
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null);
  const [isCheckingCallStatus, setIsCheckingCallStatus] = useState(false);
  

  const checkForActiveCall = useCallback(async () => {
    try {
      // Check if there's an active call in the database
      const response = await fetch("/api/calls/active-check");
      if (response.ok) {
        const { hasActiveCall, callSid } = await response.json();
        if (hasActiveCall) {
          setCallStatus("Call is active");
          setIsCalling(true);
          setCurrentCallSid(callSid);
          setIsCheckingCallStatus(true);
        }
      }
    } catch (error) {
      console.error("Error checking for active call:", error);
    }
  }, []);

  const initializeTwilio = useCallback(async () => {
    // Prevent multiple initializations
    if (device) {
      console.log("Device already initialized");
      return;
    }

    try {
      console.log("Initializing Twilio device...");
      const res = await fetch("/api/twilio/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: "caller-" + Date.now() }),
      });
      const { token } = await res.json();

      const twilioDevice = new Device(token);
      console.log("Device created, setting up event listeners");
      setDevice(twilioDevice);

      twilioDevice.on("connect", () => {
        setCallStatus("Connected to AI assistant");
        setIsCalling(true);
      });

      twilioDevice.on("disconnect", async () => {
        setCallStatus("Call ended");
        setIsCalling(false);
        setConnection(null);
      });

      twilioDevice.on("error", (error) => {
        // Ignore websocket close events (code 1005) as they're normal when calls end
        if (error.code === 1005 || error.message?.includes("websocket close")) {
          console.log("WebSocket connection closed (normal for call ending)");
          return;
        }
        console.error("Twilio device error:", error);
        setCallStatus("Error: " + error.message);
        setIsCalling(false);
      });
    } catch (error) {
      console.error("Failed to initialize Twilio:", error);
      setCallStatus("Failed to initialize");
    }
  }, [device]);

  // Initialize Twilio and check for active calls once the callbacks are defined.
  useEffect(() => {
    initializeTwilio();
    checkForActiveCall();

    // Cleanup function to destroy device on unmount
    return () => {
      if (device) {
        console.log("Destroying device on component unmount");
        device.destroy();
      }
    };
  }, [initializeTwilio, checkForActiveCall, device]);

  const startCall = async () => {
    if (!device) return;
    setCallStatus("Calling...");
    setIsCalling(true);
    setIsCheckingCallStatus(true); // Add this line
    const conn = await device.connect({ params: { To: "+13196006925" } });
    setConnection(conn);

    setTimeout(() => {
      console.log("Connection parameters:", conn.parameters);
      if (conn.parameters?.CallSid) {
        setCurrentCallSid(conn.parameters.CallSid);
        console.log("CallSid set:", conn.parameters.CallSid);
      }
    }, 2000);
  };

  const endCall = async () => {
    console.log("Ending call, device:", device, "connection:", connection);
    if (device) {
      try {
        device.disconnectAll();
        console.log("Called device.disconnectAll()");

        // If we have CallSid, also hang up via Twilio API
        if (currentCallSid) {
          try {
            console.log("Hanging up call via API:", currentCallSid);
            const response = await fetch("/api/calls/end", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callSid: currentCallSid }),
            });
            if (!response.ok) {
              const errorText = await response
                .text()
                .catch(() => "Unknown error");
              console.error("Failed to end call via API:", errorText);
            } else {
              console.log("Call ended via API");
            }
          } catch (apiError) {
            console.error("Error ending call via API:", apiError);
          }
        }

        setCallStatus("Call ended");
        setIsCalling(false);
      } catch (error) {
        console.error("Error disconnecting call:", error);
        setCallStatus("Error ending call");
      }
    } else {
      console.log("No device available to disconnect");
      setCallStatus("Call ended (no device)");
      setIsCalling(false);
    }
  };

  // Handle browser close/tab close with warning
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isCalling) {
        event.preventDefault();
        event.returnValue =
          "You have an active call. Are you sure you want to leave? The call will continue but you won't be able to control it from this page.";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isCalling]);

  // Save call state to localStorage (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const callState = {
        isCalling,
        callStatus,
        currentCallSid,
      };
      localStorage.setItem("mentalHealthCallState", JSON.stringify(callState));
    }, 500); // Debounce by 500ms

    return () => clearTimeout(timeoutId);
  }, [isCalling, callStatus, currentCallSid]);

  // Poll call status when there's an active call
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isCheckingCallStatus && currentCallSid) {
      console.log("Starting call status polling for:", currentCallSid);
      interval = setInterval(async () => {
        try {
          // Check if call still exists and is active
          const response = await fetch("/api/calls/active-check");
          if (response.ok) {
            const { hasActiveCall, callStatus: apiCallStatus } =
              await response.json();

            console.log("Call status check:", {
              hasActiveCall,
              apiCallStatus,
              currentCallSid,
            });

            if (!hasActiveCall || apiCallStatus === "completed") {
              console.log("Call ended, cleaning up");
              // Call has ended
              setCallStatus("Call ended");
              setIsCalling(false);
              setCurrentCallSid(null);
              setIsCheckingCallStatus(false);

              // Disconnect device if still connected
              if (device) {
                try {
                  device.disconnectAll();
                } catch {
                  console.log("Device already disconnected");
                }
              }
            }
          }
        } catch (error) {
          console.error("Error checking call status:", error);
        }
      }, 5000); // Check every 5 seconds (less aggressive)
    }

    return () => {
      if (interval) {
        console.log("Clearing call status polling interval");
        clearInterval(interval);
      }
    };
  }, [isCheckingCallStatus, currentCallSid, device]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Mental Health Support
        </h1>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-12 h-12 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <p className="text-gray-600 mb-4">
              Connect with our AI assistant for immediate support. If needed,
              you&apos;ll be seamlessly transferred to a human counselor.
            </p>
            <p className="text-sm text-gray-500 mb-6">Status: {callStatus}</p>
          </div>

          <div className="flex justify-center space-x-4">
            <button
              onClick={startCall}
              disabled={!device || isCalling}
              className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-full transition duration-200 disabled:bg-gray-400 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <span>Start Call</span>
            </button>
            <button
              onClick={endCall}
              disabled={!isCalling}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-full transition duration-200 disabled:bg-gray-400 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <span>End Call</span>
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Your conversation is private and confidential. Our AI will listen
              and respond helpfully.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
