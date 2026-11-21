Name:           ar-files
Version:        0.1.0
Release:        1%{?dist}
Summary:        Cloud-native desktop file manager for Fedora Workstation (GNOME)

License:        GPL-3.0-or-later
URL:            https://github.com/ar-files/ar-files
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  rust-packaging
BuildRequires:  cargo
BuildRequires:  gcc
BuildRequires:  gcc-c++
BuildRequires:  make
BuildRequires:  nodejs
BuildRequires:  npm
BuildRequires:  webkit2gtk4.1-devel
BuildRequires:  libadwaita-devel
BuildRequires:  openssl-devel
BuildRequires:  fuse3-devel
BuildRequires:  sqlite-devel
BuildRequires:  dbus-devel
BuildRequires:  systemd-rpm-macros

Requires:       webkit2gtk4.1
Requires:       libadwaita
Requires:       fuse3
Requires:       dbus-common
Requires:       gsettings-desktop-schemas

%description
AR Files is an asynchronous, cloud-native desktop file manager
engineered for Fedora Workstation and GNOME.

It eliminates UI freezes common in legacy file managers when accessing cloud or
remote network filesystems through an architectural local-first approach:
- Instant directory browsing and searching powered by local SQLite WAL metadata and FTS5.
- Sparse cloud placeholders that reflect actual file sizes with zero local block allocations.
- Resumable on-demand hydration with non-blocking UI background downloads.
- Real-time delta synchronization and deterministic conflict resolution.
- Native FUSE virtual filesystem providing transparent file access to CLI and external apps.
- Full Libadwaita / GNOME 50 human interface guidelines integration with Wayland and dark mode.

%prep
%autosetup -n %{name}-%{version}

%build
# Build frontend web assets
cd ui
npm ci --legacy-peer-deps
npm run build
cd ..

# Build Rust binary workspace
%cargo_build

%install
# Main executable
install -D -p -m 0755 target/release/ar-files %{buildroot}%{_bindir}/ar-files

# Desktop Entry
install -D -p -m 0644 packaging/desktop/org.arfiles.ARFiles.desktop \
    %{buildroot}%{_datadir}/applications/org.arfiles.ARFiles.desktop

# AppStream Metainfo
install -D -p -m 0644 packaging/metainfo/org.arfiles.ARFiles.metainfo.xml \
    %{buildroot}%{_metainfodir}/org.arfiles.ARFiles.metainfo.xml

# Application Scalable Icon
install -D -p -m 0644 packaging/icons/hicolor/scalable/apps/org.arfiles.ARFiles.svg \
    %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/org.arfiles.ARFiles.svg

# D-Bus Activation Service
install -D -p -m 0644 packaging/dbus/org.freedesktop.FileManager1.service \
    %{buildroot}%{_datadir}/dbus-1/services/org.freedesktop.FileManager1.service

# Systemd User Unit
install -D -p -m 0644 packaging/systemd/ar-files.service \
    %{buildroot}%{_userunitdir}/ar-files.service

%post
%systemd_user_post ar-files.service
update-desktop-database &> /dev/null || :
touch --no-create %{_datadir}/icons/hicolor &>/dev/null || :
which gtk4-update-icon-cache &>/dev/null && gtk4-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null || :

%preun
%systemd_user_preun ar-files.service

%postun
%systemd_user_postun_with_restart ar-files.service
update-desktop-database &> /dev/null || :
if [ $1 -eq 0 ] ; then
    touch --no-create %{_datadir}/icons/hicolor &>/dev/null
    which gtk4-update-icon-cache &>/dev/null && gtk4-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null || :
fi

%files
%license LICENSE
%doc README.md
%{_bindir}/ar-files
%{_datadir}/applications/org.arfiles.ARFiles.desktop
%{_metainfodir}/org.arfiles.ARFiles.metainfo.xml
%{_datadir}/icons/hicolor/scalable/apps/org.arfiles.ARFiles.svg
%{_datadir}/dbus-1/services/org.freedesktop.FileManager1.service
%{_userunitdir}/ar-files.service

%changelog
* Sat Nov 21 2026 AR Files Team <team@arfiles.org> - 0.1.0-1
- Initial Fedora 45 RPM release of AR Files with local-first SQLite engine and FUSE support
