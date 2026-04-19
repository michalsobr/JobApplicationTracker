import { useEffect, useRef, useState } from "react";

// #region Constants and helper functions

// Base URL for the local FastAPI backend.
const API_BASE_URL = "http://127.0.0.1:8000";

// Default number of applications shown per page.
const DEFAULT_PAGE_SIZE = 5;

// Default sorting used when no custom column sort is active.
const DEFAULT_SORT = {
  sortBy: "date_applied",
  order: "desc",
};

// Earliest allowed applied date in the form inputs.
const MIN_APPLIED_DATE = "2000-01-01";

// Return today's date in YYYY-MM-DD format for HTML date inputs.
const getTodayDateString = () => {
  return new Date().toISOString().split("T")[0];
};

// Return a fresh empty form state for both add and edit flows.
const createInitialFormData = () => ({
  company_name: "",
  job_title: "",
  status: "Applied",
  date_applied: getTodayDateString(),
  location: "",
  notes: "",
  deadline: "",
});

// Normalize a location so filtering works case-insensitively.
const normalizeLocationValue = (location) => {
  return location.trim().toLowerCase();
};

// Convert a location into a clean display label for the UI.
const formatLocationLabel = (location) => {
  return location
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Format a YYYY-MM-DD date into d/m/yyyy.
const formatDate = (dateString) => {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

// Format backend timestamps for the read/edit modal metadata.
const formatDateTime = (dateTimeString) => {
  if (!dateTimeString) return "—";

  const date = new Date(dateTimeString);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// Create a timestamped export filename so each CSV is clear and unique.
const getExportFileName = () => {
  const now = new Date();

  const pad = (value) => String(value).padStart(2, "0");

  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();

  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  return `job_application_tracker_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.csv`;
};

// Return how many full days remain until a deadline.
const getDaysUntilDeadline = (deadlineString) => {
  if (!deadlineString) return null;

  const deadline = new Date(`${deadlineString}T00:00:00`);

  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const differenceInMs = deadline - today;
  return Math.floor(differenceInMs / (1000 * 60 * 60 * 24));
};

// Return the badge style that matches a given application status.
const getStatusBadgeStyle = (status) => {
  switch (status) {
    case "Applied":
      return styles.statusApplied;
    case "Interview":
      return styles.statusInterview;
    case "Offer":
      return styles.statusOffer;
    case "Rejected":
      return styles.statusRejected;
    default:
      return styles.statusApplied;
  }
};

// Return both the display text and style for the deadline column.
const getDeadlineDisplay = (deadlineString) => {
  if (!deadlineString) {
    return {
      text: "—",
      style: styles.deadlineNormal,
    };
  }

  const formattedDate = formatDate(deadlineString);

  if (!formattedDate) {
    return {
      text: "—",
      style: styles.deadlineNormal,
    };
  }

  const daysUntilDeadline = getDaysUntilDeadline(deadlineString);

  if (daysUntilDeadline === null || Number.isNaN(daysUntilDeadline)) {
    return {
      text: formattedDate,
      style: styles.deadlineNormal,
    };
  }

  // Deadlines in the past are marked as overdue.
  if (daysUntilDeadline < 0) {
    return {
      text: `${formattedDate} (Overdue)`,
      style: styles.deadlineOverdue,
    };
  }

  // Deadlines within the next 7 days get extra emphasis.
  if (daysUntilDeadline <= 7) {
    return {
      text: `${formattedDate} (${daysUntilDeadline} day${daysUntilDeadline === 1 ? "" : "s"} left)`,
      style: styles.deadlineSoon,
    };
  }

  return {
    text: formattedDate,
    style: styles.deadlineNormal,
  };
};

// #endregion

function App() {
  // #region State

  // Main application data shown in the table.
  const [applications, setApplications] = useState([]);

  // Dashboard stats shown in the top summary cards.
  const [stats, setStats] = useState(null);

  // Filter state for the applications table.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [allLocationOptions, setAllLocationOptions] = useState([]);

  // Pagination state.
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Sorting state.
  const [sortBy, setSortBy] = useState(DEFAULT_SORT.sortBy);
  const [sortOrder, setSortOrder] = useState(DEFAULT_SORT.order);

  // Tracks whether the user has moved away from the default sort.
  const [isCustomSortActive, setIsCustomSortActive] = useState(false);

  // Add application form state.
  const [formData, setFormData] = useState(createInitialFormData());
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal state.
  const [editingApplication, setEditingApplication] = useState(null);
  const [editFormData, setEditFormData] = useState(createInitialFormData());
  const [isUpdating, setIsUpdating] = useState(false);

  // Tracks which application is currently being deleted.
  const [deletingId, setDeletingId] = useState(null);

  // Dropdown open/closed state.
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isAddStatusDropdownOpen, setIsAddStatusDropdownOpen] = useState(false);
  const [isEditStatusDropdownOpen, setIsEditStatusDropdownOpen] = useState(false);

  // Top banner for success and error feedback.
  const [banner, setBanner] = useState({
    text: "",
    type: "",
    visible: false,
  });

  // #endregion

  // #region Refs

  // Ref used to set the "All locations" checkbox indeterminate state.
  const allLocationsCheckboxRef = useRef(null);

  // Dropdown refs used for click-outside closing.
  const locationDropdownRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const addStatusDropdownRef = useRef(null);
  const editStatusDropdownRef = useRef(null);

  // #endregion

  // #region Derived values

  const locationOptions = allLocationOptions;
  const statusOptions = ["Applied", "Interview", "Offer", "Rejected"];

  // True only when all available locations are selected.
  const allLocationsSelected =
    locationOptions.length > 0 &&
    selectedLocations.length === locationOptions.length;

  // True when only some locations are selected.
  const someLocationsSelected =
    selectedLocations.length > 0 &&
    selectedLocations.length < locationOptions.length;

  // Used to distinguish a real location filter from the default "all selected" state.
  const hasActiveLocationFilter =
    locationOptions.length > 0 &&
    selectedLocations.length > 0 &&
    selectedLocations.length < locationOptions.length;

  // Used by the empty state to tell "no data yet" apart from "no filtered results".
  const hasAnyActiveFilters =
    Boolean(search.trim()) ||
    Boolean(statusFilter) ||
    hasActiveLocationFilter;

  const currentPage = Math.floor(skip / pageSize) + 1;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  // #endregion

  // #region Small UI helpers

  const showBanner = (text, type) => {
    setBanner({
      text,
      type,
      visible: true,
    });
  };

  const hideBanner = () => {
    setBanner({
      text: "",
      type: "",
      visible: false,
    });
  };

  // Render the status filter button text or badge.
  const renderStatusFilterLabel = () => {
    if (!statusFilter) {
      return <span>All statuses</span>;
    }

    return (
      <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(statusFilter) }}>
        {statusFilter}
      </span>
    );
  };

  // Show the correct sort arrow for each table column.
  const getSortIndicator = (column) => {
    if (!isCustomSortActive || sortBy !== column) {
      return " ↕";
    }

    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  // Highlight the currently active sort column.
  const getHeaderStyle = (column) => {
    const isActive = isCustomSortActive && sortBy === column;

    return {
      ...styles.sortableTh,
      color: isActive ? "#111827" : "#374151",
      backgroundColor: isActive ? "#e5e7eb" : "#f9fafb",
      fontWeight: isActive ? "700" : "600",
    };
  };

  // #endregion

  // #region Data fetching

  // Fetch the main applications list using the current filters, sorting, and pagination.
  const fetchApplications = async () => {
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(pageSize),
      sort_by: sortBy,
      order: sortOrder,
    });

    if (search.trim()) {
      params.append("search", search.trim());
    }

    if (statusFilter) {
      params.append("status", statusFilter);
    }

    // Only send location filters when a subset is selected.
    const shouldFilterByLocation =
      selectedLocations.length > 0 &&
      selectedLocations.length < locationOptions.length;

    if (shouldFilterByLocation) {
      selectedLocations.forEach((location) => {
        params.append("location", location);
      });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/applications/?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch applications");
      }

      const data = await response.json();
      setApplications(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error("Error fetching applications:", error);
      showBanner("Failed to load applications.", "error");
    }
  };

  // Fetch the dashboard summary cards.
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/applications/stats`);

      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
      showBanner("Failed to load dashboard stats.", "error");
    }
  };

  // Fetch all distinct locations for the location filter dropdown.
  const fetchLocations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/applications/locations`);

      if (!response.ok) {
        throw new Error("Failed to fetch locations");
      }

      const data = await response.json();

      const options = data.map((location) => ({
        value: normalizeLocationValue(location),
        label: formatLocationLabel(location),
      }));

      setAllLocationOptions(options);

      // Preserve the user's current location selection where possible.
      setSelectedLocations((currentSelected) => {
        if (currentSelected.length === 0) {
          return options.map((location) => location.value);
        }

        const validSelectedLocations = currentSelected.filter((selectedValue) =>
          options.some((location) => location.value === selectedValue)
        );

        if (validSelectedLocations.length === 0) {
          return options.map((location) => location.value);
        }

        return validSelectedLocations;
      });
    } catch (error) {
      console.error("Error fetching locations:", error);
      showBanner("Failed to load locations.", "error");
    }
  };

  // Refresh the two main dashboard data sources after create/update/delete actions.
  const refreshApplicationsAndStats = async () => {
    await Promise.all([fetchApplications(), fetchStats()]);
  };

  // #endregion

  // #region Filter, sorting, and pagination handlers

  const handleSearchChange = (event) => {
    setSearch(event.target.value);

    // Reset to the first page whenever the user changes filters.
    setSkip(0);
  };

  // Number of applications shown per page dropdown filter.
  const handlePageSizeChange = (event) => {
    setPageSize(Number(event.target.value));
    setSkip(0);
  };

  const handlePreviousPage = () => {
    setSkip((currentSkip) => Math.max(currentSkip - pageSize, 0));
  };

  const handleNextPage = () => {
    if (skip + pageSize < total) {
      setSkip((currentSkip) => currentSkip + pageSize);
    }
  };

  // Toggle one location option on or off in the multi-select dropdown.
  const handleLocationToggle = (locationValue) => {
    setSelectedLocations((currentLocations) => {
      if (currentLocations.includes(locationValue)) {
        return currentLocations.filter((item) => item !== locationValue);
      }

      return [...currentLocations, locationValue];
    });

    setSkip(0);
  };

  // Toggle all locations on or off.
  const handleAllLocationsToggle = () => {
    if (selectedLocations.length === locationOptions.length) {
      setSelectedLocations([]);
    } else {
      setSelectedLocations(locationOptions.map((location) => location.value));
    }

    setSkip(0);
  };

  // Table header sorting cycles: default -> ascending -> descending -> back to default.
  const handleSortClick = (column) => {
    if (!isCustomSortActive) {
      setSortBy(column);
      setSortOrder("asc");
      setIsCustomSortActive(true);
      setSkip(0);
      return;
    }

    if (sortBy !== column) {
      setSortBy(column);
      setSortOrder("asc");
      setIsCustomSortActive(true);
      setSkip(0);
      return;
    }

    if (sortOrder === "asc") {
      setSortOrder("desc");
      setSkip(0);
      return;
    }

    setSortBy(DEFAULT_SORT.sortBy);
    setSortOrder(DEFAULT_SORT.order);
    setIsCustomSortActive(false);
    setSkip(0);
  };

  // #endregion

  // #region Add form handlers

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setFormData((currentData) => ({
      ...currentData,
      [name]: value,
    }));
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    hideBanner();

    // Frontend validation mirrors the backend rule for deadline dates.
    if (formData.deadline && formData.deadline < formData.date_applied) {
      showBanner("Deadline cannot be earlier than the applied date.", "error");
      setIsSubmitting(false);
      return;
    }

    // Trim user input before sending it to the backend.
    const payload = {
      ...formData,
      company_name: formData.company_name.trim(),
      job_title: formData.job_title.trim(),
      location: formData.location.trim(),
      notes: formData.notes.trim() || null,
      deadline: formData.deadline || null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/applications/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to create application");
      }

      setFormData(createInitialFormData());
      setIsAddStatusDropdownOpen(false);
      setSkip(0);

      await refreshApplicationsAndStats();
      await fetchLocations();

      showBanner("Application created successfully.", "success");
    } catch (error) {
      console.error("Error creating application:", error);
      showBanner("Failed to create application.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // #endregion

  // #region Edit modal handlers

  // Open the modal and preload the selected application's current values.
  const openEditModal = (application) => {
    setEditingApplication(application);
    setEditFormData({
      company_name: application.company_name ?? "",
      job_title: application.job_title ?? "",
      status: application.status ?? "Applied",
      date_applied: application.date_applied ?? getTodayDateString(),
      location: application.location ?? "",
      notes: application.notes ?? "",
      deadline: application.deadline ?? "",
    });
    hideBanner();
  };

  const closeEditModal = () => {
    setIsEditStatusDropdownOpen(false);
    setEditingApplication(null);
    setEditFormData(createInitialFormData());
  };

  const handleEditFormChange = (event) => {
    const { name, value } = event.target;

    setEditFormData((currentData) => ({
      ...currentData,
      [name]: value,
    }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();

    if (!editingApplication) {
      return;
    }

    setIsUpdating(true);
    hideBanner();

    // Frontend validation mirrors the backend rule for deadline dates.
    if (editFormData.deadline && editFormData.deadline < editFormData.date_applied) {
      showBanner("Deadline cannot be earlier than the applied date.", "error");
      setIsUpdating(false);
      return;
    }

    const payload = {
      ...editFormData,
      company_name: editFormData.company_name.trim(),
      job_title: editFormData.job_title.trim(),
      location: editFormData.location.trim(),
      notes: editFormData.notes.trim() || null,
      deadline: editFormData.deadline || null,
    };

    try {
      const response = await fetch(
        `${API_BASE_URL}/applications/${editingApplication.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update application");
      }

      closeEditModal();
      await refreshApplicationsAndStats();
      await fetchLocations();

      showBanner("Application updated successfully.", "success");
    } catch (error) {
      console.error("Error updating application:", error);
      showBanner("Failed to update application.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  // #endregion

  // #region Delete and export handlers

  const handleDeleteApplication = async (application) => {
    const confirmed = window.confirm(
      `Delete application for ${application.job_title} at ${application.company_name}?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(application.id);
    hideBanner();

    try {
      const response = await fetch(`${API_BASE_URL}/applications/${application.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete application");
      }

      // If the deleted row was the last one on the current page, move back one page.
      const isOnlyItemOnPage = applications.length === 1;
      const newTotal = total - 1;
      const shouldMoveToPreviousPage = isOnlyItemOnPage && skip > 0 && skip >= newTotal;

      if (shouldMoveToPreviousPage) {
        setSkip((currentSkip) => Math.max(currentSkip - pageSize, 0));
      } else {
        await refreshApplicationsAndStats();
        await fetchLocations();
      }

      showBanner("Application deleted successfully.", "success");
    } catch (error) {
      console.error("Error deleting application:", error);
      showBanner("Failed to delete application.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  // Export all currently filtered applications as CSV.
  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams({
        sort_by: sortBy,
        order: sortOrder,
      });

      if (search.trim()) {
        params.append("search", search.trim());
      }

      if (statusFilter) {
        params.append("status", statusFilter);
      }

      // Export should match the same subset the user is currently viewing.
      const shouldFilterByLocation =
        selectedLocations.length > 0 &&
        selectedLocations.length < locationOptions.length;

      if (shouldFilterByLocation) {
        selectedLocations.forEach((location) => {
          params.append("location", location);
        });
      }

      const response = await fetch(
        `${API_BASE_URL}/applications/export/csv?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to export CSV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = getExportFileName();

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);

      showBanner("CSV exported successfully.", "success");
    } catch (error) {
      console.error("Error exporting CSV:", error);
      showBanner("Failed to export CSV.", "error");
    }
  };

  // #endregion

  // #region Effects

  // Reload the applications table whenever filters, sorting, or pagination change.
  useEffect(() => {
    fetchApplications();
  }, [
    search,
    statusFilter,
    selectedLocations,
    skip,
    pageSize,
    sortBy,
    sortOrder,
    isCustomSortActive,
  ]);

  // Load dashboard stats on first render.
  useEffect(() => {
    fetchStats();
  }, []);

  // Load all available locations on first render.
  useEffect(() => {
    fetchLocations();
  }, []);

  // Show the checkbox in an indeterminate state when only some locations are selected.
  useEffect(() => {
    if (allLocationsCheckboxRef.current) {
      allLocationsCheckboxRef.current.indeterminate = someLocationsSelected;
    }
  }, [someLocationsSelected]);

  // Close dropdowns when clicking anywhere outside them.
  useEffect(() => {
    const handleDocumentMouseDown = (event) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(event.target)
      ) {
        setIsLocationDropdownOpen(false);
      }

      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target)
      ) {
        setIsStatusDropdownOpen(false);
      }

      if (
        addStatusDropdownRef.current &&
        !addStatusDropdownRef.current.contains(event.target)
      ) {
        setIsAddStatusDropdownOpen(false);
      }

      if (
        editStatusDropdownRef.current &&
        !editStatusDropdownRef.current.contains(event.target)
      ) {
        setIsEditStatusDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, []);

  // #endregion

  // #region Render

  return (
    <div style={styles.page}>
      {/* Top success / error feedback banner */}
      {banner.visible && (
        <div
          style={{
            ...styles.banner,
            ...(banner.type === "success" ? styles.bannerSuccess : styles.bannerError),
          }}
        >
          <span>{banner.text}</span>
          <button onClick={hideBanner} style={styles.bannerCloseButton}>
            ×
          </button>
        </div>
      )}

      <header style={styles.header}>
        <h1 style={styles.title}>Job Application Tracker</h1>
        <p style={styles.subtitle}>
          Track applications, statuses, and progress all in one place.
        </p>
      </header>

      {/* Dashboard summary cards */}
      {stats && (
        <section style={styles.statsGrid}>
          <div style={styles.card}>
            <h3>Total</h3>
            <p style={styles.cardValue}>{stats.total}</p>
          </div>
          <div style={styles.card}>
            <h3>Active</h3>
            <p style={styles.cardValue}>{stats.active}</p>
          </div>
          <div style={styles.card}>
            <h3>Closed</h3>
            <p style={styles.cardValue}>{stats.closed}</p>
          </div>
          <div style={styles.card}>
            <h3>Response Rate</h3>
            <p style={styles.cardValue}>{stats.response_rate}%</p>
          </div>
        </section>
      )}

      {/* Add application form section */}
      <section style={styles.section}>
        {/* Clickable collapsible header for the add form */}
        <div
          style={styles.collapsibleHeader}
          onClick={() => {
            setIsAddFormOpen((current) => !current);
            setIsAddStatusDropdownOpen(false);
          }}
        >
          <h2 style={styles.sectionTitle}>Add Application</h2>
          <span
            style={{
              ...styles.collapseIcon,
              transform: isAddFormOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            ▼
          </span>
        </div>

        {isAddFormOpen && (
          <form onSubmit={handleFormSubmit} style={styles.form}>
            {/* Basic text fields for the new application */}
            <input
              type="text"
              name="company_name"
              placeholder="Company name"
              value={formData.company_name}
              onChange={handleFormChange}
              required
              style={styles.input}
            />

            <input
              type="text"
              name="job_title"
              placeholder="Job title"
              value={formData.job_title}
              onChange={handleFormChange}
              required
              style={styles.input}
            />

            <input
              type="text"
              name="location"
              placeholder="Location"
              value={formData.location}
              onChange={handleFormChange}
              required
              style={styles.input}
            />

            {/* Custom status dropdown for the add form */}
            <div ref={addStatusDropdownRef} style={styles.modalStatusFilterWrapper}>
              <button
                type="button"
                onClick={() => setIsAddStatusDropdownOpen((current) => !current)}
                style={styles.modalStatusFilterButton}
              >
                <span style={styles.statusFilterButtonContent}>
                  <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(formData.status) }}>
                    {formData.status}
                  </span>
                </span>
                <span style={styles.statusFilterChevron}>▼</span>
              </button>

              {isAddStatusDropdownOpen && (
                <div style={styles.modalStatusDropdown}>
                  {statusOptions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setFormData((currentData) => ({
                          ...currentData,
                          status,
                        }));
                        setIsAddStatusDropdownOpen(false);
                      }}
                      style={{
                        ...styles.statusDropdownOption,
                        ...(formData.status === status ? styles.statusDropdownOptionActive : {}),
                      }}
                    >
                      <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(status) }}>
                        {status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Applied date input */}
            <div style={styles.labeledField}>
              <label style={styles.fieldLabel}>Applied:</label>
              <input
                type="date"
                name="date_applied"
                value={formData.date_applied}
                onChange={handleFormChange}
                required
                min={MIN_APPLIED_DATE}
                max={getTodayDateString()}
                style={styles.input}
              />
            </div>

            {/* Optional deadline input */}
            <div style={styles.labeledField}>
              <label style={styles.fieldLabel}>Deadline:</label>
              <input
                type="date"
                name="deadline"
                value={formData.deadline}
                onChange={handleFormChange}
                min={formData.date_applied || MIN_APPLIED_DATE}
                style={styles.input}
              />
            </div>

            {/* Optional notes textarea */}
            <textarea
              name="notes"
              placeholder="Notes"
              value={formData.notes}
              onChange={handleFormChange}
              rows={3}
              style={styles.textarea}
            />

            {/* Submit button for creating a new application */}
            <button type="submit" disabled={isSubmitting} style={styles.submitButton}>
              {isSubmitting ? "Saving..." : "Add Application"}
            </button>
          </form>
        )}
      </section>

      {/* Main applications table section */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Applications</h2>
        </div>

        <div style={styles.controlsRow}>
          {/* Search by company or role */}
          <input
            type="text"
            placeholder="Search company or role"
            value={search}
            onChange={handleSearchChange}
            style={styles.input}
          />

          {/* Location multi-select dropdown filter */}
          <div ref={locationDropdownRef} style={styles.locationFilterWrapper}>
            <button
              type="button"
              onClick={() => setIsLocationDropdownOpen((current) => !current)}
              style={styles.locationFilterButton}
            >
              {selectedLocations.length === 0 || allLocationsSelected
                ? "All locations"
                : `${selectedLocations.length} location${selectedLocations.length > 1 ? "s" : ""} selected`}
              <span style={styles.locationFilterChevron}>▼</span>
            </button>

            {isLocationDropdownOpen && (
              <div style={styles.locationDropdown}>
                <label style={styles.locationOption}>
                  <input
                    ref={allLocationsCheckboxRef}
                    type="checkbox"
                    checked={allLocationsSelected}
                    onChange={handleAllLocationsToggle}
                  />
                  <span>All locations</span>
                </label>

                {locationOptions.map((location) => (
                  <label key={location.value} style={styles.locationOption}>
                    <input
                      type="checkbox"
                      checked={selectedLocations.includes(location.value)}
                      onChange={() => handleLocationToggle(location.value)}
                    />
                    <span>{location.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Status dropdown filter */}
          <div ref={statusDropdownRef} style={styles.statusFilterWrapper}>
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen((current) => !current)}
              style={styles.statusFilterButton}
            >
              <span style={styles.statusFilterButtonContent}>{renderStatusFilterLabel()}</span>
              <span style={styles.statusFilterChevron}>▼</span>
            </button>

            {isStatusDropdownOpen && (
              <div style={styles.statusDropdown}>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("");
                    setSkip(0);
                    setIsStatusDropdownOpen(false);
                  }}
                  style={{
                    ...styles.statusDropdownOption,
                    ...(!statusFilter ? styles.statusDropdownOptionActive : {}),
                  }}
                >
                  <span>All statuses</span>
                </button>

                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setStatusFilter(status);
                      setSkip(0);
                      setIsStatusDropdownOpen(false);
                    }}
                    style={{
                      ...styles.statusDropdownOption,
                      ...(statusFilter === status ? styles.statusDropdownOptionActive : {}),
                    }}
                  >
                    <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(status) }}>
                      {status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Number of applications per page dropdown filter */}
          <select value={pageSize} onChange={handlePageSizeChange} style={styles.select}>
            <option value={5}>5 per page</option>
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
          </select>

          {/* Export all currently filtered applications as CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={total === 0}
            style={{
              ...styles.secondaryButton,
              ...(total === 0 ? styles.buttonDisabledSecondary : {}),
            }}
          >
            Export CSV
          </button>
        </div>

        {/* Empty-state message changes depending on whether filters are active */}
        {applications.length === 0 ? (
          !hasAnyActiveFilters ? (
            <div style={styles.emptyState}>
              <h3 style={styles.emptyStateTitle}>No applications yet</h3>
              <p style={styles.emptyStateText}>
                Start by adding your first job application above.
              </p>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <h3 style={styles.emptyStateTitle}>No matching applications</h3>
              <p style={styles.emptyStateText}>
                Try changing your search, status, or location filters.
              </p>
            </div>
          )
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th
                    style={getHeaderStyle("company_name")}
                    onClick={() => handleSortClick("company_name")}
                  >
                    Company{getSortIndicator("company_name")}
                  </th>
                  <th
                    style={getHeaderStyle("job_title")}
                    onClick={() => handleSortClick("job_title")}
                  >
                    Role{getSortIndicator("job_title")}
                  </th>
                  <th
                    style={getHeaderStyle("location")}
                    onClick={() => handleSortClick("location")}
                  >
                    Location{getSortIndicator("location")}
                  </th>
                  <th
                    style={getHeaderStyle("status")}
                    onClick={() => handleSortClick("status")}
                  >
                    Status{getSortIndicator("status")}
                  </th>
                  <th
                    style={getHeaderStyle("date_applied")}
                    onClick={() => handleSortClick("date_applied")}
                  >
                    Applied{getSortIndicator("date_applied")}
                  </th>
                  <th
                    style={getHeaderStyle("deadline")}
                    onClick={() => handleSortClick("deadline")}
                  >
                    Deadline{getSortIndicator("deadline")}
                  </th>
                  <th style={styles.actionsTh}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const deadlineDisplay = getDeadlineDisplay(app.deadline);

                  return (
                    <tr
                      key={app.id}
                      style={styles.tableRow}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.backgroundColor = "#f9fafb";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.backgroundColor = "#ffffff";
                      }}
                    >
                      <td style={styles.td}>{app.company_name}</td>
                      <td style={styles.td}>{app.job_title}</td>
                      <td style={styles.td}>{app.location}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(app.status) }}>
                          {app.status}
                        </span>
                      </td>
                      <td style={styles.td}>{formatDate(app.date_applied)}</td>
                      <td style={styles.td}>
                        <span style={deadlineDisplay.style}>{deadlineDisplay.text}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionButtons}>
                          {/* Open modal for viewing and editing an application */}
                          <button
                            type="button"
                            onClick={() => openEditModal(app)}
                            style={styles.secondaryButton}
                          >
                            View
                          </button>

                          {/* Delete an application from the table */}
                          <button
                            type="button"
                            onClick={() => handleDeleteApplication(app)}
                            disabled={deletingId === app.id}
                            style={{
                              ...styles.dangerButton,
                              ...(deletingId === app.id ? styles.buttonDisabled : {}),
                            }}
                          >
                            {deletingId === app.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Previous / next page controls */}
        <div style={styles.paginationRow}>
          <button
            onClick={handlePreviousPage}
            disabled={skip === 0}
            style={{
              ...styles.button,
              ...(skip === 0 ? styles.buttonDisabled : {}),
            }}
          >
            Previous
          </button>

          <span style={styles.pageText}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={skip + pageSize >= total}
            style={{
              ...styles.button,
              ...(skip + pageSize >= total ? styles.buttonDisabled : {}),
            }}
          >
            Next
          </button>
        </div>
      </section>

      {/* Edit/view modal for an existing application */}
      {editingApplication && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Application Details</h2>
              <button type="button" onClick={closeEditModal} style={styles.modalCloseButton}>
                ×
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={styles.modalForm}>
              {/* Editable company field */}
              <input
                type="text"
                name="company_name"
                placeholder="Company name"
                value={editFormData.company_name}
                onChange={handleEditFormChange}
                required
                style={styles.input}
              />

              {/* Editable role field */}
              <input
                type="text"
                name="job_title"
                placeholder="Job title"
                value={editFormData.job_title}
                onChange={handleEditFormChange}
                required
                style={styles.input}
              />

              {/* Editable location field */}
              <input
                type="text"
                name="location"
                placeholder="Location"
                value={editFormData.location}
                onChange={handleEditFormChange}
                required
                style={styles.input}
              />

              {/* Custom status dropdown inside the modal */}
              <div ref={editStatusDropdownRef} style={styles.modalStatusFilterWrapper}>
                <button
                  type="button"
                  onClick={() => setIsEditStatusDropdownOpen((current) => !current)}
                  style={styles.modalStatusFilterButton}
                >
                  <span style={styles.statusFilterButtonContent}>
                    <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(editFormData.status) }}>
                      {editFormData.status}
                    </span>
                  </span>
                  <span style={styles.statusFilterChevron}>▼</span>
                </button>

                {isEditStatusDropdownOpen && (
                  <div style={styles.modalStatusDropdown}>
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setEditFormData((currentData) => ({
                            ...currentData,
                            status,
                          }));
                          setIsEditStatusDropdownOpen(false);
                        }}
                        style={{
                          ...styles.statusDropdownOption,
                          ...(editFormData.status === status ? styles.statusDropdownOptionActive : {}),
                        }}
                      >
                        <span style={{ ...styles.statusBadge, ...getStatusBadgeStyle(status) }}>
                          {status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Editable applied date field */}
              <div style={styles.labeledField}>
                <label style={styles.fieldLabel}>Applied:</label>
                <input
                  type="date"
                  name="date_applied"
                  value={editFormData.date_applied}
                  onChange={handleEditFormChange}
                  required
                  min={MIN_APPLIED_DATE}
                  max={getTodayDateString()}
                  style={styles.input}
                />
              </div>

              {/* Editable optional deadline field */}
              <div style={styles.labeledField}>
                <label style={styles.fieldLabel}>Deadline:</label>
                <input
                  type="date"
                  name="deadline"
                  value={editFormData.deadline}
                  onChange={handleEditFormChange}
                  min={editFormData.date_applied || MIN_APPLIED_DATE}
                  style={styles.input}
                />
              </div>

              {/* Editable notes field */}
              <textarea
                name="notes"
                placeholder="Notes"
                value={editFormData.notes}
                onChange={handleEditFormChange}
                rows={4}
                style={styles.textarea}
              />

              {/* Read-only metadata showing when the application was created and last updated */}
              <div style={styles.modalMeta}>
                <div style={styles.modalMetaItem}>
                  <span style={styles.modalMetaLabel}>Created:</span>
                  <span>{formatDateTime(editingApplication.created_at)}</span>
                </div>

                <div style={styles.modalMetaItem}>
                  <span style={styles.modalMetaLabel}>Last updated:</span>
                  <span>{formatDateTime(editingApplication.updated_at)}</span>
                </div>
              </div>

              {/* Modal action buttons */}
              <div style={styles.modalActions}>
                <button type="button" onClick={closeEditModal} style={styles.secondaryButton}>
                  Cancel
                </button>
                <button type="submit" disabled={isUpdating} style={styles.submitButton}>
                  {isUpdating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // #endregion
}

const styles = {
  // #region Page layout

  page: {
    minHeight: "100vh",
    backgroundColor: "#f5f7fb",
    padding: "32px",
    fontFamily: "Arial, sans-serif",
    color: "#1f2937",
  },
  header: {
    marginBottom: "32px",
  },
  title: {
    margin: 0,
    fontSize: "2rem",
  },
  subtitle: {
    marginTop: "8px",
    color: "#6b7280",
  },

  // #endregion

  // #region Dashboard cards

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
  },
  cardValue: {
    fontSize: "1.8rem",
    fontWeight: "bold",
    margin: "8px 0 0 0",
  },

  // #endregion

  // #region Shared sections and form layout

  section: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
    marginBottom: "24px",
  },
  sectionHeader: {
    marginBottom: "16px",
  },
  sectionTitle: {
    margin: 0,
  },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  controlsRow: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "16px",
  },
  labeledField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  fieldLabel: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "#374151",
  },

  // #endregion

  // #region Inputs and text areas

  input: {
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    minWidth: "180px",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    backgroundColor: "#ffffff",
  },
  textarea: {
    gridColumn: "1 / -1",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    resize: "vertical",
    width: "100%",
    boxSizing: "border-box",
  },

  // #endregion

  // #region Buttons

  button: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "0.95rem",
  },
  submitButton: {
    width: "fit-content",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "0.95rem",
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  dangerButton: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#dc2626",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  buttonDisabled: {
    backgroundColor: "#9ca3af",
    cursor: "not-allowed",
  },
  buttonDisabledSecondary: {
    opacity: 0.6,
    cursor: "not-allowed",
  },

  // #endregion

  // #region Banner

  banner: {
    position: "sticky",
    top: "16px",
    zIndex: 1000,
    maxWidth: "720px",
    margin: "0 auto 24px auto",
    padding: "16px 20px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    color: "#ffffff",
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
  },
  bannerSuccess: {
    backgroundColor: "#10b981",
  },
  bannerError: {
    backgroundColor: "#ef4444",
  },
  bannerCloseButton: {
    background: "transparent",
    border: "none",
    color: "#ffffff",
    fontSize: "1.5rem",
    cursor: "pointer",
    lineHeight: 1,
  },

  // #endregion

  // #region Table

  tableWrapper: {
    overflowX: "auto",
    marginTop: "16px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  sortableTh: {
    textAlign: "left",
    padding: "12px",
    borderBottom: "2px solid #e5e7eb",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  actionsTh: {
    textAlign: "left",
    padding: "12px",
    borderBottom: "2px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  },
  tableRow: {
    transition: "background-color 0.15s ease",
  },
  actionButtons: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },

  // #endregion

  // #region Pagination and collapsible header

  paginationRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "20px",
    flexWrap: "wrap",
  },
  pageText: {
    color: "#4b5563",
    fontSize: "0.95rem",
  },
  collapsibleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    marginBottom: "16px",
    userSelect: "none",
  },
  collapseIcon: {
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "#374151",
    transition: "transform 0.2s ease",
  },

  // #endregion

  // #region Dropdowns and badges

  locationFilterWrapper: {
    position: "relative",
  },
  locationFilterButton: {
    minWidth: "220px",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    fontSize: "0.95rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  locationFilterChevron: {
    fontSize: "0.8rem",
    color: "#4b5563",
  },
  locationDropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    minWidth: "220px",
    maxHeight: "260px",
    overflowY: "auto",
    backgroundColor: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.08)",
    padding: "10px",
    zIndex: 20,
  },
  locationOption: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 4px",
    fontSize: "0.95rem",
    cursor: "pointer",
  },
  statusFilterWrapper: {
    position: "relative",
  },
  statusFilterButton: {
    minWidth: "220px",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    fontSize: "0.95rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  statusFilterButtonContent: {
    display: "flex",
    alignItems: "center",
  },
  statusFilterChevron: {
    fontSize: "0.8rem",
    color: "#4b5563",
  },
  statusDropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    minWidth: "220px",
    backgroundColor: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.08)",
    padding: "8px",
    zIndex: 20,
  },
  statusDropdownOption: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "8px",
    border: "none",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    cursor: "pointer",
    marginBottom: "4px",
  },
  statusDropdownOptionActive: {
    backgroundColor: "#f3f4f6",
  },
  statusBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: "600",
    lineHeight: 1.2,
  },
  statusApplied: {
    backgroundColor: "#e5e7eb",
    color: "#374151",
  },
  statusInterview: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
  },
  statusOffer: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  statusRejected: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
  },

  // #endregion

  // #region Deadline styles

  deadlineNormal: {
    color: "#1f2937",
    fontWeight: "500",
  },
  deadlineSoon: {
    color: "#c2410c",
    fontWeight: "600",
  },
  deadlineOverdue: {
    color: "#dc2626",
    fontWeight: "700",
  },

  // #endregion

  // #region Modal

  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    zIndex: 2000,
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "720px",
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.18)",
    padding: "24px",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
  },
  modalTitle: {
    margin: 0,
  },
  modalCloseButton: {
    background: "transparent",
    border: "none",
    fontSize: "1.8rem",
    lineHeight: 1,
    cursor: "pointer",
    color: "#374151",
  },
  modalForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  modalActions: {
    gridColumn: "1 / -1",
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "8px",
  },
  modalMeta: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "4px",
    padding: "4px 2px",
    color: "#4b5563",
    fontSize: "0.95rem",
  },
  modalMetaItem: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  modalMetaLabel: {
    fontWeight: "700",
    color: "#374151",
  },
  modalStatusFilterWrapper: {
    position: "relative",
    width: "100%",
  },
  modalStatusFilterButton: {
    width: "100%",
    minHeight: "58px",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    fontSize: "0.95rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  modalStatusDropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    width: "100%",
    backgroundColor: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.08)",
    padding: "8px",
    zIndex: 30,
  },

  // #endregion

  // #region Empty state

  emptyState: {
    marginTop: "16px",
    padding: "32px 20px",
    border: "1px dashed #d1d5db",
    borderRadius: "12px",
    backgroundColor: "#f9fafb",
    textAlign: "center",
  },
  emptyStateTitle: {
    margin: "0 0 8px 0",
    fontSize: "1.1rem",
    color: "#111827",
  },
  emptyStateText: {
    margin: 0,
    color: "#6b7280",
    fontSize: "0.95rem",
  },

  // #endregion
};

export default App;
