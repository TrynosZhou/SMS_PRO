const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sms_db'
});

const className = process.argv[2] || '6 Diamond';

client.connect()
  .then(() => {
    // First, find all classes with the same name and count students
    return client.query(`
      SELECT 
        c.id as class_id,
        c.name as class_name, 
        c.form as class_form,
        COUNT(s.id) as student_count
      FROM classes c 
      LEFT JOIN students s ON s."classId" = c.id 
      WHERE c.name = $1 OR c.form = $1 
      GROUP BY c.id, c.name, c.form
      ORDER BY student_count, c.name
    `, [className]);
  })
  .then(res => {
    console.log(`\nClasses with name "${className}":\n`);
    
    if (res.rows.length === 0) {
      console.log('No classes found with this name.');
      client.end();
      return;
    }
    
    // Display all classes and their student counts
    res.rows.forEach((cls, index) => {
      console.log(`Class ${index + 1}:`);
      console.log(`  Class ID: ${cls.class_id}`);
      console.log(`  Name: ${cls.class_name}`);
      console.log(`  Form: ${cls.class_form}`);
      console.log(`  Student Count: ${cls.student_count}`);
      console.log('');
    });
    
    // Find the class with only 1 student
    const classWithOneStudent = res.rows.find(cls => parseInt(cls.student_count) === 1);
    
    if (classWithOneStudent) {
      console.log(`\n=== Class with only 1 student ===\n`);
      console.log(`Class ID: ${classWithOneStudent.class_id}`);
      console.log(`Class Name: ${classWithOneStudent.class_name}`);
      console.log(`Class Form: ${classWithOneStudent.class_form}`);
      console.log('');
      
      // Get the student details
      return client.query(`
        SELECT 
          s.id as student_id, 
          s."studentNumber" as student_id_number, 
          s."firstName", 
          s."lastName"
        FROM students s 
        WHERE s."classId" = $1
      `, [classWithOneStudent.class_id]);
    } else {
      console.log(`\nNo class found with exactly 1 student.`);
      client.end();
      return Promise.resolve({ rows: [] });
    }
  })
  .then(res => {
    if (res && res.rows && res.rows.length > 0) {
      console.log('Student Details:');
      console.log('================');
      res.rows.forEach((student, index) => {
        console.log(`\n${index + 1}. Name: ${student.firstName} ${student.lastName}`);
        console.log(`   Student ID: ${student.student_id_number}`);
        console.log(`   Student UUID: ${student.student_id}`);
      });
    }
    
    client.end();
  })
  .catch(err => {
    console.error('Error:', err);
    client.end();
  });

