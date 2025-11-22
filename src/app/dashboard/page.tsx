"use client";

import { useEffect, useState } from "react";
import { Device, Call } from "@twilio/voice-sdk";

interface CallWithUser {
  id: string;
  user: { phone: string };
  status: string;
  startedAt: string;
}

interface OngoingCall {
  id: string;
  user: { phone: string };
  startedAt: string;
  conversation?: {
    messages: Array<{
      role: string;
      content: string;
      timestamp: string;
    }>;
  };
}

interface EscalationWithCall {
  id: string;
  call: { user: { phone: string } };
  counselor: { name?: string };
  counselorId: string;
  notes?: string;
  escalatedAt: string;
}

interface Counselor {
  id: string;
  name: string;
  phone: string;
  status: string;
  specialties: string[];
  license?: string;
  bio?: string;
}

interface DashboardData {
  ongoingCalls: OngoingCall[];
  callLogs: CallWithUser[];
  escalations: EscalationWithCall[];
  stats: {
    completedToday: number;
    totalEscalations: number;
  };
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCounselor, setNewCounselor] = useState({
    name: "",
    phone: "",
    email: "",
    specialties: "",
    license: "",
    bio: "",
  });
  const [_device, setDevice] = useState<Device | null>(null);
  const [_connection, setConnection] = useState<Call | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then(setData);
    loadCounselors();
    initializeTwilio();
  }, []);

  // Poll for updates when there are ongoing calls
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (data && data.ongoingCalls && data.ongoingCalls.length > 0) {
      console.log(
        `Starting polling for ${data.ongoingCalls.length} ongoing calls`
      );
      interval = setInterval(() => {
        console.log("Polling for dashboard updates...");
        fetch("/api/dashboard")
          .then((res) => res.json())
          .then((newData) => {
            const ongoingCount = newData?.ongoingCalls?.length || 0;
            console.log(`Polled data: ${ongoingCount} ongoing calls`);
            setData(newData);
          })
          .catch((error) => console.error("Polling error:", error));
      }, 3000); // Refresh every 3 seconds for faster updates
    }

    return () => {
      if (interval) {
        console.log("Stopping polling");
        clearInterval(interval);
      }
    };
  }, [data]);

  const initializeTwilio = async () => {
    try {
      const res = await fetch("/api/twilio/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: "counselor-dashboard" }),
      });
      const { token } = await res.json();

      const twilioDevice = new Device(token);
      setDevice(twilioDevice);

      twilioDevice.on("incoming", (conn) => {
        setConnection(conn);
        // Auto-accept for demo
        conn.accept();
      });

      twilioDevice.on("connect", () => {});

      twilioDevice.on("disconnect", () => {
        setConnection(null);
      });

      twilioDevice.on("error", (error) => {
        // Ignore websocket close events (code 1005) as they're normal when calls end
        if (error.code === 1005 || error.message?.includes("websocket close")) {
          console.log("WebSocket connection closed (normal for call ending)");
          return;
        }
        console.error("Twilio device error:", error);
      });
    } catch (error) {
      console.error("Failed to initialize Twilio:", error);
    }
  };

  const loadCounselors = async () => {
    const res = await fetch("/api/counselors");
    if (res.ok) {
      const data = await res.json();
      setCounselors(data);
    }
  };

  const updateCounselorStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/counselors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      loadCounselors();
    }
  };

  const addCounselor = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/counselors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newCounselor,
        specialties: newCounselor.specialties.split(",").map((s) => s.trim()),
      }),
    });
    if (res.ok) {
      setNewCounselor({
        name: "",
        phone: "",
        email: "",
        specialties: "",
        license: "",
        bio: "",
      });
      setShowAddForm(false);
      loadCounselors();
    }
  };

  const takeOverCall = async (callId: string) => {
    const res = await fetch("/api/counselor/takeover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
    if (res.ok) {
      // Refresh data
      fetch("/api/dashboard")
        .then((res) => res.json())
        .then(setData);
      loadCounselors();
    } else {
      alert("Failed to take over call");
    }
  };

  const endOngoingCall = async (callId: string) => {
    if (!confirm("Are you sure you want to end this ongoing call?")) return;

    try {
      const res = await fetch("/api/calls/end-by-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });

      if (res.ok) {
        // Refresh data
        fetch("/api/dashboard")
          .then((res) => res.json())
          .then(setData);
        alert("Call ended successfully");
      } else {
        alert("Failed to end call");
      }
    } catch (error) {
      console.error("Error ending call:", error);
      alert("Error ending call");
    }
  };

  const endAllOngoingCalls = async () => {
    if (!data || !data.ongoingCalls) return;

    if (
      !confirm(
        `Are you sure you want to end all ${data.ongoingCalls.length} ongoing calls?`
      )
    )
      return;

    try {
      const promises = data.ongoingCalls.map((call) =>
        fetch("/api/calls/end-by-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: call.id }),
        })
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((res) => res.ok).length;

      // Refresh data
      fetch("/api/dashboard")
        .then((res) => res.json())
        .then(setData);

      alert(
        `Successfully ended ${successCount} out of ${data.ongoingCalls.length} calls`
      );
    } catch (error) {
      console.error("Error ending calls:", error);
      alert("Error ending calls");
    }
  };

  if (!data) return <div>Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Counselor Dashboard
          </h1>
          <p className="mt-2 text-gray-600">
            Monitor and manage mental health support calls
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">
                  Active Calls
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {data.ongoingCalls.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">
                  Completed Today
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {data.callLogs.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Escalations</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {data.stats.totalEscalations}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">
                  Available Counselors
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {counselors.filter((c) => c.status === "available").length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Ongoing Calls */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Ongoing AI Calls
                </h2>
                <p className="text-sm text-gray-600">
                  Active conversations requiring attention
                </p>
              </div>
              {data.ongoingCalls.length > 0 && (
                <button
                  onClick={endAllOngoingCalls}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-200"
                >
                  End All Calls ({data.ongoingCalls.length})
                </button>
              )}
            </div>
            <div className="p-6">
              {data.ongoingCalls.length === 0 ? (
                <div className="text-center py-8">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
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
                  <p className="mt-2 text-sm text-gray-500">
                    No ongoing AI calls at the moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.ongoingCalls.map((call) => (
                    <div
                      key={call.id}
                      className="border border-blue-200 rounded-lg p-4 bg-blue-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-sm font-medium text-blue-700">
                              Active Call
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 mb-1">
                            <span className="font-medium">User:</span>{" "}
                            {call.user.phone}
                          </p>
                          <p className="text-xs text-gray-600 mb-3">
                            Started: {new Date(call.startedAt).toLocaleString()}
                          </p>
                          {call.conversation?.messages &&
                            call.conversation.messages.length > 0 && (
                              <div className="bg-white rounded p-3 border">
                                <p className="text-xs font-medium text-gray-700 mb-2">
                                  Recent Messages:
                                </p>
                                <div className="space-y-1 max-h-20 overflow-y-auto">
                                  {call.conversation.messages
                                    .slice(0, 3)
                                    .map((msg, idx) => (
                                      <div key={idx} className="text-xs">
                                        <span className="font-medium capitalize text-gray-600">
                                          {msg.role}:
                                        </span>{" "}
                                        <span className="text-gray-800">
                                          {msg.content.substring(0, 60)}...
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                        </div>
                        <div className="ml-4 flex space-x-2">
                          <button
                            onClick={() => takeOverCall(call.id)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md text-sm font-medium transition duration-200"
                          >
                            Take Over
                          </button>
                          <button
                            onClick={() => endOngoingCall(call.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium transition duration-200"
                          >
                            End Call
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Call Logs */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Call Logs</h2>
              <p className="text-sm text-gray-600">Recent completed calls</p>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {data.callLogs.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {call.user.phone}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(call.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        call.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : call.status === "escalated"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {call.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Escalations */}
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Escalations
            </h2>
            <p className="text-sm text-gray-600">
              Calls that required counselor intervention
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {data.escalations.map((esc) => (
                <div
                  key={esc.id}
                  className="border border-yellow-200 rounded-lg p-4 bg-yellow-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        User: {esc.call.user.phone}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        Counselor: {esc.counselor.name || esc.counselorId}
                      </p>
                      <p className="text-xs text-gray-500 mb-2">
                        Escalated: {new Date(esc.escalatedAt).toLocaleString()}
                      </p>
                      {esc.notes && (
                        <div className="bg-white rounded p-2 border">
                          <p className="text-xs text-gray-700">{esc.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Counselors Management */}
        <div className="mt-8 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Counselors
              </h2>
              <p className="text-sm text-gray-600">
                Manage counselor availability and information
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-200"
            >
              {showAddForm ? "Cancel" : "Add Counselor"}
            </button>
          </div>

          {showAddForm && (
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <form onSubmit={addCounselor} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newCounselor.name}
                      onChange={(e) =>
                        setNewCounselor({
                          ...newCounselor,
                          name: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={newCounselor.phone}
                      onChange={(e) =>
                        setNewCounselor({
                          ...newCounselor,
                          phone: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newCounselor.email}
                      onChange={(e) =>
                        setNewCounselor({
                          ...newCounselor,
                          email: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Specialties
                    </label>
                    <input
                      type="text"
                      placeholder="Comma separated"
                      value={newCounselor.specialties}
                      onChange={(e) =>
                        setNewCounselor({
                          ...newCounselor,
                          specialties: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      License
                    </label>
                    <input
                      type="text"
                      value={newCounselor.license}
                      onChange={(e) =>
                        setNewCounselor({
                          ...newCounselor,
                          license: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={newCounselor.bio}
                      onChange={(e) =>
                        setNewCounselor({
                          ...newCounselor,
                          bio: e.target.value,
                        })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md text-sm font-medium transition duration-200"
                  >
                    Add Counselor
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {counselors.map((counselor) => (
                <div
                  key={counselor.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {counselor.name}
                      </h3>
                      <p className="text-sm text-gray-600">{counselor.phone}</p>
                    </div>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        counselor.status === "available"
                          ? "bg-green-100 text-green-800"
                          : counselor.status === "busy"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {counselor.status}
                    </span>
                  </div>

                  {counselor.specialties.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        Specialties
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {counselor.specialties.map((specialty, idx) => (
                          <span
                            key={idx}
                            className="inline-flex px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <button
                      onClick={() =>
                        updateCounselorStatus(counselor.id, "available")
                      }
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-medium transition duration-200"
                    >
                      Available
                    </button>
                    <button
                      onClick={() =>
                        updateCounselorStatus(counselor.id, "busy")
                      }
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-medium transition duration-200"
                    >
                      Busy
                    </button>
                    <button
                      onClick={() =>
                        updateCounselorStatus(counselor.id, "offline")
                      }
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs font-medium transition duration-200"
                    >
                      Offline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
