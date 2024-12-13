const express = require('express');
const session = require('express-session'); // Menambahkan express-session
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const database = require('./database');
const { parseResult } = require('./utils');

const app = express();

// Konfigurasi session, menyimpan data sesi pengguna (misalnya status login).
app.use(session({
    secret: 'your-secret-key',
    //resave dan saveUninitialized mengatur pengelolaan sesi, memastikan sesi selalu disimpan.
    resave: false, 
    saveUninitialized: true
}));


// Middleware untuk parsing data

//digunakan untuk mengurai data dari form HTML yang dikirim dengan metode POST.
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
//Mengatur folder public sebagai lokasi file statis
app.use(express.static("public"));
//Membuat folder uploads dapat diakses secara publik untuk file yang diupload.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set view engine
app.set('view engine', 'ejs');

// Middleware untuk mengecek login
function checkLogin(req, res, next) {
    if (req.session.isLoggedIn) {  // Cek status login di session
        return next();
    }
    res.redirect('/login');  // Redirect ke halaman login jika belum login
}

// Halaman utama
app.get('/', function (req, res) {
    //Mendeklarasikan sebuah string SQL query yang akan mengeksekusi perintah SELECT untuk
    //mengambil semua data dari tabel library di database.
    const sql = `SELECT * FROM library;`;

    database.query(sql, function (error, results) {
        //Jika terjadi kesalahan saat menjalankan query, maka error akan dibuang (dilempar) dan website
        // akan berhenti, menampilkan pesan kesalahan di konsol.
        if (error) throw error;
        //menampilkan hasil query
        const library = parseResult(results);
        //Mengirimkan respons HTTP dengan render halaman homepage.ejs
        //library adalah data buku yang sudah diproses dan akan dikirim ke view homepage
        res.render("homepage", { library: library, isLoggedIn: req.session.isLoggedIn || false });
    });
});

// Halaman login yang menampilkan form login
app.get('/login', function (req, res) {
    res.render("adminlogin");
});

// Halaman detail buku
app.get('/detail/:ISBN', function (req, res) {
    const ISBN = req.params.ISBN;

    const sql = `SELECT * FROM library WHERE ISBN = '${ISBN}'`;

    database.query(sql, function (error, results) {
        if (error) throw error;
        const library = parseResult(results);
        res.render("bookpage", { library });
    });
});

// Proses login
app.post('/player', function (req, res) {
    const { username, password } = req.body;

    const sql = `SELECT * FROM admin`;

    database.query(sql, function (error, result) {
        if (error) throw error;

        let check = false;

        result.forEach(item => {
            const user = item.username;
            const pass = item.pass;

            if (username == user && password == pass) {
                check = true;
            }
        });

        if (check) {
            req.session.isLoggedIn = true;  // Menyimpan status login di session
            res.redirect('/libra');
        } else {
            res.render("adminlogin");
        }
    });
});

// Halaman /libra yang hanya bisa diakses setelah login
app.get('/libra', checkLogin, (req, res) => {  // Menambahkan middleware checkLogin
    const query = `SELECT judul, penerbit, kategori, penulis, ISBN, sinopsis, cover FROM library`;
    database.query(query, (err, results) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).send('Query error');
        }
        const data = parseResult(results);
        res.render('login', { data: results });
    });
});

// Proses logout
app.get('/logout', function (req, res) {
    req.session.isLoggedIn = false;  // Menghapus status login
    res.redirect('/');  // Arahkan kembali ke halaman utama
});



// Halaman untuk menambah buku
app.post('/add', multer({ dest: 'uploads/' }).single('cover'), async (req, res) => {
    const file = req.file;
    const outputPath = path.join('uploads/', `${file.originalname.split('.')[0]}.jpg`);

    //file.path adalah lokasi sementara file yang diunggah
    await sharp(file.path).jpeg({ quality: 80 }).toFile(outputPath);

    // Validasi jika file tidak ada
    if (!file) {
        return res.status(400).send('File tidak ditemukan.');
    }

    // Membaca data file dari folder sementara
    const fileData = fs.readFileSync(file.path);

    // Destructuring body request
    const { title, penerbit, kategori, penulis, ISBN, sinopsis } = req.body;

    // Query untuk memasukkan data ke database
    const sql = `INSERT INTO library VALUES ('${title}', '${penerbit}', '${kategori}', '${penulis}', '${ISBN}', '${sinopsis}', '${outputPath}')`;

    //Setelah file gambar diproses dan disimpan di lokasi yang diinginkan (outputPath), file asli yang berada
    //di folder sementara (file.path) dihapus dengan fs.unlinkSync() untuk menghindari pemborosan ruang disk di server.
    fs.unlinkSync(file.path);

    database.query(sql, (error, results) => {
        if (error) {
            console.error('Error saat menyimpan data:', error);
            return res.status(500).send('Gagal menyimpan data ke database.');
        }
        res.redirect('/libra');
    });
});

// Rute untuk menghapus buku berdasarkan ISBN
app.post('/delete/:ISBN', (req, res) => {
    const libraryISBN = req.params.ISBN;
    const query = `DELETE FROM library WHERE ISBN = ?`; // Query SQL untuk menghapus berdasarkan ISBN

    database.query(query, [libraryISBN], (err) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).send('Query error');
        }
        res.redirect('/libra');
    });
});

// Rute untuk halaman edit
app.post('/edit/:ISBN', (req, res) => {
    const libraryISBN = req.params.ISBN;
    const query = `SELECT * FROM library WHERE ISBN = ?`;

    database.query(query, [libraryISBN], (err, results) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).send('Query error');
        }
        res.render('edit', { library: results });
    });
});

// Rute untuk menyimpan perubahan setelah edit
app.post('/insert/:ISBN', (req, res) => {
    const bookISBN = req.params.ISBN;
    const { judul, penerbit, kategori, penulis, sinopsis } = req.body;

    const query = `
        UPDATE library
        SET judul = '${judul}', penerbit = '${penerbit}', kategori = '${kategori}', penulis = '${penulis}', sinopsis = '${sinopsis}'
        WHERE ISBN = '${bookISBN}'
    `;

    database.query(query, (err) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).send('Query error');
        }
        res.redirect('/libra');
    });
});

// Jalankan server
app.listen(5005, function (error) {
    if (error) throw error;
    console.log("Server berjalan di port 5005");
});
